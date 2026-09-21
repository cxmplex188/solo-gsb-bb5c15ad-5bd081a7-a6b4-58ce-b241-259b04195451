// 后台提示（cue）：屏幕注册表 + 提示状态机（纯逻辑模块，便于单测）
//
// 设计要点：
//  - 每块投屏首次打开时由浏览器生成不可重复的 screenId 并持久化（localStorage），
//    连接后通过 screen_register 注册；页面刷新/断线重连沿用同一 id。
//  - 每屏在服务端内存中只保存“最新一条提示”的状态：
//      pending   未送达（目标屏当前不在线，尚未有任何连接收到该提示）
//      displayed 已送达并已全屏显示（投屏端回执 cue_displayed）
//      acked     已确认（投屏端回执 cue_ack）
//  - cueSeq 为全服务单调递增序号：新提示覆盖旧提示；
//    迟到的旧回执（seq 对不上当前提示）一律忽略，绝不改变新提示状态。
//  - 重连/刷新后，只要该屏最新提示未确认，就向新连接补发该提示。
//
// 连接以“不透明 token”形式登记（生产环境即 ws 对象），本模块不触碰传输细节；
// sendCue / register 返回需要投递的 { token, payload } 清单，由 index.js 执行实际发送。

export const CUE_PRESETS = {
  stage: { kind: 'stage', text: '请上场' },
  hurry: { kind: 'hurry', text: '请加快' },
  end: { kind: 'end', text: '请结束' },
};
export const CUE_KINDS = ['stage', 'hurry', 'end', 'custom'];
export const MAX_CUSTOM_LEN = 30; // 自定义提示不超过 30 字
export const MAX_SCREEN_NAME_LEN = 20;
export const MAX_SCREENS = 200; // 内存保护：防随意注册导致无限增长
const SCREEN_ID_RE = /^s-[a-f0-9]{16,64}$/;

export function isValidScreenId(id) {
  return typeof id === 'string' && SCREEN_ID_RE.test(id);
}

// 生成浏览器持久化用的屏幕 id：s- + 16 字节随机十六进制（与服务端校验规则一致）
export function genScreenId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `s-${hex}`;
}

// 显示名规范化：trim 后截断；空串返回 ''（由调用方决定回退默认名）
export function normalizeName(raw) {
  return String(raw ?? '').trim().slice(0, MAX_SCREEN_NAME_LEN);
}

export function defaultName(screenId) {
  return `投屏 ${screenId.slice(-4)}`;
}

// 提示内容校验与规范化。返回 { cue } 或抛 { code, message } 风格 Error。
export function normalizeCue(raw) {
  const kind = raw?.kind;
  if (kind === 'custom') {
    // 按码点计数，中日韩“一个字”即一个码点
    const text = String(raw.text ?? '').trim().slice(0, MAX_CUSTOM_LEN);
    if (!text) {
      throw cueError('BAD_CUE', '自定义提示内容不能为空');
    }
    return { kind, text };
  }
  const preset = CUE_PRESETS[kind];
  if (!preset) {
    throw cueError('BAD_CUE', `提示类型非法（${CUE_KINDS.join(' / ')} / custom）`);
  }
  return { ...preset };
}

class CueError extends Error {}
function cueError(code, message) {
  return Object.assign(new CueError(message), { code });
}

export class ScreenRegistry {
  constructor() {
    this.screens = new Map(); // screenId -> { id, name, online, firstSeenMs, cue, conns }
    this.cueSeq = 0;          // 全服务单调递增，运行期不归零
  }

  // 注册 / 重连。
  //   token  本次连接（同一屏幕可有多连接，如同一浏览器开了两个标签页）
//   name   仅新屏幕首次注册时作为初始显示名（可空）
  // 返回 { screen, isNew, replays }：
  //   replays —— 该屏最新“未确认”提示（含已显示的），需向新连接补发；已确认则不补发
  register(screenId, token, rawName) {
    if (!isValidScreenId(screenId)) {
      throw cueError('BAD_SCREEN_ID', '屏幕 ID 非法');
    }
    let screen = this.screens.get(screenId);
    let isNew = false;
    if (!screen) {
      if (this.screens.size >= MAX_SCREENS) {
        throw cueError('TOO_MANY_SCREENS', `已达屏幕数量上限 ${MAX_SCREENS}`);
      }
      const name = normalizeName(rawName) || defaultName(screenId);
      screen = {
        id: screenId,
        name,
        online: false,
        firstSeenMs: Date.now(),
        cue: null, // { seq, kind, text, sentAtMs, status }
        conns: new Set(),
      };
      this.screens.set(screenId, screen);
      isNew = true;
    }
    if (token != null && !screen.conns.has(token)) {
      screen.conns.add(token);
      screen.online = true;
    }
    const replays = screen.cue && screen.cue.status !== 'acked' ? [screen.cue] : [];
    return { screen, isNew, replays };
  }

  // 连接关闭：解绑；该屏无连接后置为离线（提示状态保留，等待重连补发）
  unbind(screenId, token) {
    const screen = this.screens.get(screenId);
    if (!screen) return { changed: false, wentOffline: false };
    const had = screen.conns.delete(token);
    const wentOffline = screen.conns.size === 0 && screen.online;
    if (wentOffline) screen.online = false;
    return { changed: had, wentOffline };
  }

  rename(screenId, rawName) {
    const screen = this.screens.get(screenId);
    if (!screen) throw cueError('SCREEN_NOT_FOUND', '屏幕未注册');
    const name = normalizeName(rawName);
    if (!name) throw cueError('BAD_NAME', '显示名不能为空');
    const changed = name !== screen.name;
    screen.name = name;
    return { screen, changed };
  }

  get(screenId) {
    return this.screens.get(screenId) ?? null;
  }

  // 控制台发送提示。
  //   targetIds: ['s-..', ...] 指定一块或多块（离线屏会排队 pending，待重连补发）；
  //              [] 或省略表示“全部在线投屏”（离线屏不是本次目标，不排队）。
  // 返回 { seq, deliveries }：
  //   deliveries: [{ token, cue }] —— 需单播的连接清单（在线目标的全部连接）
  // 显式指定的目标若未注册则报错（不产生任何状态变更）。
  sendCue(rawTargets, rawCue) {
    const cue = normalizeCue(rawCue);
    let targets;
    let broadcastOnline = false;
    if (rawTargets == null || (Array.isArray(rawTargets) && rawTargets.length === 0)) {
      broadcastOnline = true;
      targets = [...this.screens.values()].filter((s) => s.conns.size > 0);
    } else {
      if (!Array.isArray(rawTargets)) {
        throw cueError('BAD_TARGET', '目标必须是屏幕 ID 数组');
      }
      const ids = [];
      for (const t of rawTargets) {
        if (!isValidScreenId(t)) throw cueError('BAD_TARGET', '目标屏幕 ID 非法');
        if (!ids.includes(t)) ids.push(t);
      }
      const missing = ids.filter((id) => !this.screens.has(id));
      if (missing.length) {
        throw cueError('SCREEN_NOT_FOUND', `目标屏幕未注册: ${missing.join(', ')}`);
      }
      targets = ids.map((id) => this.screens.get(id));
    }
    if (targets.length === 0) {
      throw cueError(broadcastOnline ? 'NO_ONLINE_SCREEN' : 'NO_TARGET',
        broadcastOnline ? '当前没有在线投屏' : '目标为空');
    }

    const seq = ++this.cueSeq;
    const sentAtMs = Date.now();
    const deliveries = [];
    for (const screen of targets) {
      const online = screen.conns.size > 0;
      // 新提示覆盖旧提示：无论旧提示处于什么状态，都替换为本屏最新状态。
      // 在线屏初始 pending，等投屏端收到并全屏显示后回执 displayed；
      // 离线屏停留 pending，重连注册后补发。
      screen.cue = { ...cue, seq, sentAtMs, status: 'pending' };
      if (online) {
        for (const token of screen.conns) deliveries.push({ token, cue: screen.cue });
      }
    }
    return { seq, deliveries };
  }

  // 投屏端回执“已显示”。仅当 seq 等于该屏当前提示且尚未确认时生效。
  // 返回 { changed }；迟到的旧回执（seq 不符）静默忽略。
  markDisplayed(screenId, seq) {
    const screen = this.screens.get(screenId);
    if (!screen || !screen.cue) return { changed: false };
    if (screen.cue.seq !== seq) return { changed: false };
    if (screen.cue.status !== 'pending') return { changed: false };
    screen.cue.status = 'displayed';
    return { changed: true, screen };
  }

  // 投屏端回执“已确认”。同样严格比对 seq，迟到旧确认不得改变新提示状态。
  // 返回 { changed, tokens }：tokens 为该屏全部连接（需向同屏其他标签页同步关闭）
  markAcked(screenId, seq) {
    const screen = this.screens.get(screenId);
    if (!screen || !screen.cue) return { changed: false, tokens: [] };
    if (screen.cue.seq !== seq) return { changed: false, tokens: [] };
    if (screen.cue.status === 'acked') {
      return { changed: false, tokens: [...screen.conns] };
    }
    screen.cue.status = 'acked';
    return { changed: true, screen, tokens: [...screen.conns] };
  }

  // 控制台视图：按首次注册顺序列出所有屏幕及其最新提示状态
  roster() {
    return [...this.screens.values()]
      .sort((a, b) => a.firstSeenMs - b.firstSeenMs || a.id.localeCompare(b.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        online: s.online,
        cue: s.cue
          ? {
              seq: s.cue.seq,
              kind: s.cue.kind,
              text: s.cue.text,
              status: s.cue.status,
              sentAtMs: s.cue.sentAtMs,
            }
          : null,
      }));
  }
}
