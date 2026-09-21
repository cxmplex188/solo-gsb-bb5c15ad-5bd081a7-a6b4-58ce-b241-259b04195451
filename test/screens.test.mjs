// 后台提示状态机纯逻辑测试：
// 屏幕注册/改名、单播/多选/全部在线发送、cueSeq 单调递增、
// 新提示覆盖旧提示、迟到旧回执不改变新提示状态、断线重连补发未确认最新提示、
// 非目标屏收不到提示、已确认提示不补发。
import {
  ScreenRegistry,
  genScreenId,
  isValidScreenId,
  normalizeCue,
  MAX_CUSTOM_LEN,
} from '../server/src/screens.js';

let passed = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name} ${extra}`);
  }
}
function throws(fn, codePart, name) {
  try {
    fn();
    ok(name, false, '未抛错');
  } catch (e) {
    ok(name, String(e.code || e.message).includes(codePart), `got ${e.code}`);
  }
}

console.log('1) 屏幕 ID 生成与校验');
const id = genScreenId();
ok('id 形如 s-+32位十六进制', /^s-[a-f0-9]{32}$/.test(id), id);
ok('id 不可重复（1000 次抽样唯一）', new Set(Array.from({ length: 1000 }, genScreenId)).size === 1000);
ok('合法 id 通过校验', isValidScreenId(id));
ok('非法 id 被拒', !isValidScreenId('s-xyz') && !isValidScreenId('c-123'));

console.log('2) 注册：首次注册/重复注册/离线重连');
const reg = new ScreenRegistry();
const a = reg.register(id, 'wsA', '主屏');
ok('首次注册 isNew=true 且默认/传入名称生效', a.isNew && a.screen.name === '主屏');
ok('新屏在线', a.screen.online === true);
const a2 = reg.register(id, 'wsA2');
ok('同屏第二连接 isNew=false', a2.isNew === false);
ok('同屏无未确认提示时无补发', a2.replays.length === 0);
ok('非法 id 注册抛错', (() => {
  try { reg.register('bad', 't'); return false; } catch { return true; }
})());

console.log('3) 改名');
const rn = reg.rename(id, '  舞台主屏  ');
ok('改名 trim 生效', rn.screen.name === '舞台主屏' && rn.changed === true);
ok('改成相同名 changed=false', reg.rename(id, '舞台主屏').changed === false);
throws(() => reg.rename(id, '   '), 'BAD_NAME', '空名被拒');
throws(() => reg.rename('s-0123456789abcdef0123456789abcdef', 'x'), 'NOT_FOUND', '未注册屏改名被拒');

console.log('4) 发送：无屏幕/无在线屏幕报错');
const empty = new ScreenRegistry();
throws(() => empty.sendCue([], { kind: 'stage' }), 'NO_ONLINE_SCREEN', '空注册表“全部在线”被拒');
throws(() => empty.sendCue([genScreenId()], { kind: 'stage' }), 'NOT_FOUND', '空注册表显式目标被拒');
const onlyOffline = new ScreenRegistry();
const offId = genScreenId();
onlyOffline.register(offId, 't1');
onlyOffline.unbind(offId, 't1');
throws(() => onlyOffline.sendCue([], { kind: 'stage' }), 'NO_ONLINE_SCREEN', '全部在线但无在线屏被拒');
// 但显式指定离线屏应当成功（排队补发）
const queued = onlyOffline.sendCue([offId], { kind: 'end' });
ok('显式指定离线屏发送成功并排队', queued.deliveries.length === 0 && queued.seq === 1);
ok('离线屏状态=pending（未送达）', onlyOffline.get(offId).cue.status === 'pending');

console.log('5) cueSeq 单调递增 + 单播/多播/全部在线');
const r = new ScreenRegistry();
const s1 = genScreenId();
const s2 = genScreenId();
const s3 = genScreenId();
r.register(s1, 'w1');
r.register(s2, 'w2');
r.register(s3, 'w3a');
r.register(s3, 'w3b'); // 同屏两个连接
r.unbind(s3, 'w3a');
r.unbind(s3, 'w3b'); // s3 离线

const d1 = r.sendCue([s1], { kind: 'stage' });
ok('单播 seq=1 且仅一个投递', d1.seq === 1 && d1.deliveries.length === 1 && d1.deliveries[0].token === 'w1');
ok('s1 提示文本=请上场', d1.deliveries[0].cue.text === '请上场');

const d2 = r.sendCue([s1, s2], { kind: 'hurry' });
ok('多播 seq=2', d2.seq === 2 && new Set(d2.deliveries.map((x) => x.token)) .size === 2);

const d3 = r.sendCue([], { kind: 'end' });
ok('全部在线只投递 s1/s2（s3 离线不是目标）',
  d3.seq === 3 && d3.deliveries.length === 2 &&
  d3.deliveries.every((x) => x.token === 'w1' || x.token === 'w2'));

throws(() => r.sendCue([s1, genScreenId()], { kind: 'end' }), 'NOT_FOUND', '含未注册目标整体被拒');
ok('被拒发送不产生 seq（仍为 3）', r.cueSeq === 3);

console.log('6) 状态流转：pending -> displayed -> acked');
const rr = new ScreenRegistry();
const x = genScreenId();
rr.register(x, 'wx');
rr.sendCue([x], { kind: 'stage' }); // seq 1
ok('初始 pending', rr.get(x).cue.status === 'pending');
ok('markDisplayed 生效', rr.markDisplayed(x, 1).changed === true);
ok('状态=displayed', rr.get(x).cue.status === 'displayed');
ok('重复 displayed 不生效', rr.markDisplayed(x, 1).changed === false);
const ack = rr.markAcked(x, 1);
ok('ack 生效且回传全部连接', ack.changed === true && ack.tokens.includes('wx'));
ok('状态=acked', rr.get(x).cue.status === 'acked');

console.log('7) 新提示覆盖旧提示；迟到旧回执不改新状态');
rr.sendCue([x], { kind: 'end' }); // seq 2 覆盖已确认的 seq 1
const cur = rr.get(x).cue;
ok('新提示 seq=2 且状态重置为 pending', cur.seq === 2 && cur.status === 'pending');
ok('迟到的旧 displayed(seq=1) 被忽略', rr.markDisplayed(x, 1).changed === false);
ok('迟到的旧 ack(seq=1) 被忽略', rr.markAcked(x, 1).changed === false);
ok('旧回执后新提示仍是 pending', rr.get(x).cue.status === 'pending');
rr.markDisplayed(x, 2);
ok('旧 ack 也不会错误确认新提示（新提示仍 displayed）', rr.get(x).cue.status === 'displayed');

console.log('8) 重连补发：未确认（pending/displayed）补发；已确认不补发');
const rec = new ScreenRegistry();
const p = genScreenId();
const q = genScreenId();
rec.register(p, 'wp1');
rec.register(q, 'wq1');
rec.sendCue([p, q], { kind: 'stage' }); // seq 1
rec.markDisplayed(p, 1);  // p 已显示未确认
rec.markDisplayed(q, 1);
rec.markAcked(q, 1);      // q 已确认
// 两屏断线
rec.unbind(p, 'wp1');
rec.unbind(q, 'wq1');
const p2 = rec.register(p, 'wp2');
const q2 = rec.register(q, 'wq2');
ok('未确认屏重连补发最新提示（displayed 也补发）',
  p2.replays.length === 1 && p2.replays[0].seq === 1,
  JSON.stringify(p2.replays));
ok('已确认屏重连不补发', q2.replays.length === 0);

console.log('9) 非目标屏不得收到提示');
const t = new ScreenRegistry();
const n1 = genScreenId();
const n2 = genScreenId();
t.register(n1, 'n1');
t.register(n2, 'n2');
const one = t.sendCue([n1], { kind: 'custom', text: '只给1号屏' });
ok('仅 n1 被投递', one.deliveries.length === 1 && one.deliveries[0].token === 'n1');
ok('n2 没有任何最新提示', t.get(n2).cue === null);

console.log('10) 自定义提示校验（≤30 字、按码点计数）');
ok('预设提示规范化', normalizeCue({ kind: 'hurry' }).text === '请加快');
ok('30 字自定义通过', normalizeCue({ kind: 'custom', text: '字'.repeat(MAX_CUSTOM_LEN) }).text.length === MAX_CUSTOM_LEN);
ok('超长自动截断到 30 字', normalizeCue({ kind: 'custom', text: '字'.repeat(40) }).text.length === MAX_CUSTOM_LEN);
throws(() => normalizeCue({ kind: 'custom', text: '   ' }), 'BAD_CUE', '空白自定义被拒');
throws(() => normalizeCue({ kind: 'weird' }), 'BAD_CUE', '未知类型被拒');

console.log('11) roster 视图：在线标记与最新状态');
const view = t.roster();
ok('roster 含全部屏幕', view.length === 2);
ok('roster 中 n1 携带提示文本与 seq',
  view.find((s) => s.id === n1).cue.text === '只给1号屏'
  && view.find((s) => s.id === n1).cue.status === 'pending');
ok('roster 中 n2 cue=null', view.find((s) => s.id === n2).cue === null);

console.log(`\n结果：${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  console.log('失败项:', failures.join('; '));
  process.exit(1);
}
