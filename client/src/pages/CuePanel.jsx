import { useEffect, useRef, useState } from 'react';

// 后台提示面板：
//  - 按屏幕实时列出在线状态与最新提示状态（未送达 / 已显示 / 已确认）；
//  - 勾选一块或多块屏幕发送；未勾选时“发送给全部在线投屏”；
//  - 离线目标也可勾选：提示在服务端排队（未送达），该屏重连后自动补发。
const PRESETS = [
  { kind: 'stage', label: '请上场', cls: 'cue-stage' },
  { kind: 'hurry', label: '请加快', cls: 'cue-hurry' },
  { kind: 'end', label: '请结束', cls: 'cue-end' },
];
const MAX_CUSTOM = 30;

export default function CuePanel({ snap, canEdit, send, lastError, onClearError, sentSeq }) {
  const screens = snap?.screens ?? null;
  const [selected, setSelected] = useState(() => new Set());
  const [custom, setCustom] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [flashSeq, setFlashSeq] = useState(null);
  const prevSentSeq = useRef(0);

  // cue_sent 回执：短暂高亮“已发送 #seq”
  useEffect(() => {
    if (sentSeq && sentSeq !== prevSentSeq.current) {
      prevSentSeq.current = sentSeq;
      setFlashSeq(sentSeq);
      const t = setTimeout(() => setFlashSeq(null), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [sentSeq]);

  // 服务端错误（如 NO_ONLINE_SCREEN / BAD_CUE）展示 4 秒
  useEffect(() => {
    if (!lastError) return undefined;
    const t = setTimeout(onClearError, 4000);
    return () => clearTimeout(t);
  }, [lastError, onClearError]);

  if (!screens) {
    return (
      <fieldset className="panel" disabled>
        <legend>后台提示</legend>
        <p className="hint">正在加载屏幕列表…</p>
      </fieldset>
    );
  }

  const onlineIds = screens.filter((s) => s.online).map((s) => s.id);
  const toggle = (id) => setSelected((prev) => {
    const nextSet = new Set(prev);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    return nextSet;
  });
  const selectOnline = () => setSelected(new Set(onlineIds));
  const clearSel = () => setSelected(new Set());

  // 已选目标中可能含离线屏：在线立即送达，离线排队为重连补发
  const selectedOnline = screens.filter((s) => selected.has(s.id) && s.online).length;
  const selectedOffline = selected.size - selectedOnline;
  const targetDesc = selected.size === 0
    ? `全部在线投屏（${onlineIds.length} 块）`
    : `已选 ${selected.size} 块（在线 ${selectedOnline}${selectedOffline ? `，离线 ${selectedOffline} 将补发` : ''}）`;

  const fire = (kind, text) => {
    // targetIds 为空数组即“全部在线”；显式目标可含离线屏
    send({ command: 'cue_send', targetIds: [...selected], kind, text });
  };

  const submitRename = (id) => {
    const name = renameDraft.trim().slice(0, 20);
    if (name) send({ command: 'screen_rename', screenId: id, name });
    setRenamingId(null);
  };

  return (
    <fieldset className="panel cue-panel" disabled={!canEdit}>
      <legend>后台提示（请上场 / 请加快 / 请结束 / 自定义，≤30 字）</legend>

      <div className="cue-toolbar">
        <div className="cue-preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.kind}
              type="button"
              className={`btn btn-cue ${p.cls}`}
              onClick={() => fire(p.kind)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="cue-custom-row">
          <input
            value={custom}
            maxLength={MAX_CUSTOM}
            placeholder="自定义提示（不超过 30 字）"
            onChange={(e) => setCustom(e.target.value.slice(0, MAX_CUSTOM))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) fire('custom', custom.trim());
            }}
          />
          <span className="cue-char-count">{[...custom.trim()].length}/{MAX_CUSTOM}</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!custom.trim()}
            onClick={() => fire('custom', custom.trim())}
          >
            发送自定义
          </button>
        </div>
        <div className="cue-target-row">
          <span className="cue-target-desc">目标：{targetDesc}</span>
          <button type="button" className="btn btn-mini" onClick={selectOnline}>选中全部在线</button>
          <button type="button" className="btn btn-mini" onClick={clearSel} disabled={selected.size === 0}>
            清除选择（=全部在线）
          </button>
          {flashSeq != null && <span className="cue-flash">✓ 已发送 #{flashSeq}</span>}
        </div>
        {lastError && <p className="agenda-error">⚠ {lastError.message}</p>}
      </div>

      <div className="screen-table">
        <div className="screen-row screen-head">
          <span>选择</span>
          <span>显示名（点击改名）</span>
          <span>在线</span>
          <span>最新提示</span>
          <span>状态</span>
        </div>
        {screens.length === 0 && (
          <p className="hint">尚无投屏打开 /display 并连入服务。</p>
        )}
        {screens.map((s) => {
          const status = s.cue ? STATUS[s.cue.status]?.(s.online) ?? null : null;
          const isSel = selected.has(s.id);
          return (
            <div
              key={s.id}
              className={`screen-row ${isSel ? 'screen-selected' : ''} ${!s.online ? 'screen-offline' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <span>
                <input type="checkbox" checked={isSel} onChange={() => toggle(s.id)} onClick={(e) => e.stopPropagation()} />
              </span>
              <span className="screen-name-cell" onClick={(e) => e.stopPropagation()}>
                {renamingId === s.id ? (
                  <input
                    className="screen-rename-input"
                    autoFocus
                    value={renameDraft}
                    maxLength={20}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => submitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(s.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="screen-name-btn"
                      title={`屏幕 ID：${s.id}`}
                      onClick={() => { setRenamingId(s.id); setRenameDraft(s.name); }}
                    >
                      {s.name}
                    </button>
                    <code className="screen-id">{s.id.slice(-6)}</code>
                  </>
                )}
              </span>
              <span>
                <span className={`dot ${s.online ? 'dot-on' : 'dot-off'}`} />
                {s.online ? '在线' : '离线'}
              </span>
              <span className="screen-cue-text">
                {s.cue ? (
                  <>
                    <span className={`cue-tag cue-tag-${s.cue.kind}`}>{kindLabel(s.cue.kind)}</span>
                    {s.cue.text}
                    <code className="cue-seq">#{s.cue.seq}</code>
                  </>
                ) : <em className="muted">—</em>}
              </span>
              <span>
                {status ? (
                  <span className={`cue-status cue-status-${s.cue.status}`}>{status.label}</span>
                ) : <em className="muted">无提示</em>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="hint">
        未勾选任何屏幕时，提示发送给<b>全部在线投屏</b>；新提示覆盖旧提示；
        离线屏的未确认提示会在其重连后自动补发，确认后不再弹出。
      </p>
    </fieldset>
  );
}

const STATUS = {
  // 离线 pending：尚未送达，等待重连补发；在线 pending：已投递、等待该屏“已显示”回执
  pending: (online) => ({ label: online ? '送达中…' : '未送达（离线，待补发）' }),
  displayed: () => ({ label: '已显示' }),
  acked: () => ({ label: '已确认' }),
};

function kindLabel(kind) {
  return { stage: '请上场', hurry: '请加快', end: '请结束', custom: '自定义' }[kind] || kind;
}
