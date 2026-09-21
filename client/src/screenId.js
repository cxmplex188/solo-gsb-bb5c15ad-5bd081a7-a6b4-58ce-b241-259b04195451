// 投屏身份：屏幕 ID 首次打开时生成并持久化于 localStorage，
// 页面刷新 / 断线重连 / 重启浏览器后沿用同一 ID（服务端据此补发未确认提示）。
// 与服务端校验规则保持一致：s- + 16~64 位十六进制。
const ID_KEY = 'vc.screenId';
const NAME_KEY = 'vc.screenName';
const ID_RE = /^s-[a-f0-9]{16,64}$/;

export function genScreenId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `s-${hex}`;
}

// 读取既有 ID；不存在或损坏则生成新 ID 并持久化。
// localStorage 不可用（隐私模式等）时退化为会话内 ID，功能仍可用但刷新后更换。
let sessionId = null;
export function getScreenId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !ID_RE.test(id)) {
      id = genScreenId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    if (!sessionId) sessionId = genScreenId();
    return sessionId;
  }
}

export function getScreenName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveScreenName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* 忽略持久化失败 */
  }
}
