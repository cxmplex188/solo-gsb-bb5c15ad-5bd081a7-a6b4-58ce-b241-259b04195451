import { useEffect, useState } from 'react';
import { useSocket } from '../useSocket.js';
import { formatTime, formatClock, liveRemaining, liveAgenda } from '../time.js';
import { saveScreenName } from '../screenId.js';

// 投屏页：纯展示，不可操作计时。状态由服务端权威快照驱动；
// 收到后台提示时全屏覆盖提示层，现场确认前不消失。
export default function DisplayPage() {
  const { snap, connState, cue, screen, send, ackCue } = useSocket({ role: 'display' });
  const [, force] = useState(0);

  // 100ms 重绘：对 running 快照做本地插值，保证大屏数字与议程预计时间平滑
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.title = cue
      ? `${cue.text} · 后台提示`
      : snap
        ? `${formatTime(liveRemaining(snap))} · 发言计时`
        : '发言计时投屏';
  }, [cue, snap]);

  if (!snap) {
    return (
      <div className="display display-idle">
        <div className="display-time">--:--</div>
        <div className="display-state">{connState === 'open' ? '等待控制台' : '连接服务中…'}</div>
        <ScreenBadge screen={screen} send={send} />
      </div>
    );
  }

  const remaining = liveRemaining(snap);
  const agenda = liveAgenda(snap);
  const cur = agenda?.items.find((it) => it.status === 'current') ?? null;
  const curIdx = cur ? agenda.items.findIndex((it) => it.id === cur.id) : -1;
  const next = curIdx >= 0 ? agenda.items[curIdx + 1] ?? null : null;

  const cls = snap.finished
    ? 'display-finished'
    : snap.warning
      ? 'display-warning'
      : snap.phase === 'idle'
        ? 'display-idle'
        : 'display-running';

  return (
    <div className={`display ${cls}`}>
      {connState !== 'open' && (
        <div className="reconnect-banner">
          {connState === 'reconnecting' ? '网络中断，正在重连并同步时间…' : '连接中…'}
        </div>
      )}

      {cur && (
        <div className="display-current">
          <span className="display-current-name">{cur.name}</span>
          {cur.fixed && <span className="display-pin">📌 固定环节</span>}
          {cur.insufficient && <span className="display-short">⚠ 时间不足</span>}
        </div>
      )}

      <div className="display-phase">
        {phaseText(snap.phase)}
      </div>

      <div className="display-time">
        {snap.finished ? '00:00' : formatTime(remaining, { tenths: snap.warning && snap.phase === 'running' })}
      </div>

      <div className="display-state">
        {snap.finished
          ? '时间到'
          : snap.phase === 'idle'
            ? '待开始'
            : snap.phase === 'paused'
              ? '已暂停'
              : snap.warning
                ? '剩余不足 1 分钟'
                : '发言进行中'}
      </div>

      {next ? (
        <div className={`display-next ${next.insufficient ? 'display-next-short' : ''}`}>
          <span className="display-next-label">下一环节</span>
          <span className="display-next-name">{next.name}{next.fixed ? ' 📌' : ''}</span>
          <span className="display-next-time">预计开始 {formatClock(next.projStartMs)}</span>
        </div>
      ) : cur ? (
        <div className="display-next">
          <span className="display-next-label">本环节为最后一项</span>
        </div>
      ) : (
        <div className="display-duration">设定时长 {formatTime(snap.durationMs)}</div>
      )}

      <ScreenBadge screen={screen} send={send} />

      {cue && <CueOverlay cue={cue} onAck={() => ackCue(cue.seq)} />}
    </div>
  );
}

function phaseText(phase) {
  return { idle: 'READY', running: 'SPEAKING', paused: 'PAUSED', finished: 'TIME UP' }[phase] || '';
}

// 左下角：屏幕显示名（控制台据此区分各屏），可就地修改并持久化
function ScreenBadge({ screen, send }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!screen) return null;

  const submit = () => {
    const name = draft.trim().slice(0, 20);
    if (name) {
      saveScreenName(name);
      send({ command: 'screen_rename', name });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="screen-badge">
        <input
          className="screen-name-input"
          autoFocus
          value={draft}
          maxLength={20}
          placeholder="显示名（最多 20 字）"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="screen-badge"
      title={`屏幕 ID：${screen.id}（点击修改显示名）`}
      onClick={() => { setDraft(screen.name ?? ''); setEditing(true); }}
    >
      🖥 {screen.name}
      <span className="screen-badge-edit">✎ 改名</span>
    </button>
  );
}

// 后台提示全屏覆盖层：非目标屏不会收到 cue，自然不会渲染
function CueOverlay({ cue, onAck }) {
  return (
    <div className={`cue-overlay cue-${cue.kind}`} role="alertdialog" aria-label="后台提示">
      <div className="cue-overlay-inner">
        <div className="cue-overlay-label">后台提示</div>
        <div className="cue-overlay-text">{cue.text}</div>
        <button type="button" className="cue-ack-btn" onClick={onAck}>
          ✓ 已确认
        </button>
        <div className="cue-overlay-hint">请现场人员确认后点击；确认前提示保持显示</div>
      </div>
    </div>
  );
}
