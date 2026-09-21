# 会场发言计时联屏（Venue Countdown）

一款用于会场发言计时、议程推演与**后台提示**的 Web 应用：一个**控制台**维护有序议程
（环节名称、计划开始时间、时长、固定开始标记）并设定当前环节，开始 / 暂停 / 继续 / 重置；
当前环节**提前结束或超时**后自动推演后续偏差，多块大屏打开**投屏页**实时联播倒计时、
当前/下一环节及其预计开始时间；进入 60 秒与归零时切换醒目状态。
控制台还可向**一块、多块或全部在线投屏**发送“请上场 / 请加快 / 请结束”及不超过 30 字的
**自定义后台提示**，投屏全屏显示并由现场确认，控制台实时看到每块屏的
未送达 / 已显示 / 已确认状态。

- **后端**：Node.js 原生 HTTP + [`ws`](https://github.com/websockets/ws) WebSocket
- **前端**：React 18 + Vite（控制台 `/console`、投屏 `/display`）
- **部署**：单容器单端口（静态文件与 WebSocket 同端口），Docker / Compose 一键启动

## 快速开始（单条命令：安装依赖并启动）

需要 Docker 与 Docker Compose v2：

```bash
docker compose up --build
```

启动后访问（容器对外端口 **3000**，可用 `PORT` 环境变量修改）：

| 页面 | 地址 | 说明 |
| --- | --- | --- |
| 首页 | <http://localhost:3000/> | 入口导航 |
| 控制台 | <http://localhost:3000/console> | 维护议程、设定当前环节、开始/暂停/继续/结束本环节（同一时刻仅一个可操作） |
| 投屏页 | <http://localhost:3000/display> | 大屏展示当前环节、下一环节及其预计开始时间，可在任意多块屏幕同时打开 |

典型操作入口（控制台页内）：

1. 在 **议程偏差推演** 面板逐行维护有序环节：名称、计划开始（`HH:MM`）、时长（分钟）、
   勾选 📌 表示**固定环节**；可用 ↑↓ 排序、增删行，完成后点 **保存议程并同步投屏**。
2. 点某一行的 **设为当前** 载入该环节并开始倒计时；运行中可暂停/继续，
   点 **结束本环节 / 进入下一环节** 按实际结束点固化偏差并自动开始下一环节。
3. 投屏页无需任何操作，即同步显示当前环节名称、倒计时、下一环节与预计开始时间。
4. （后台提示）在控制台 **后台提示** 面板勾选一块或多块屏幕（不勾选 = 全部在线投屏），
   点击 **请上场 / 请加快 / 请结束**，或在输入框填写 **不超过 30 字** 的自定义提示后发送；
   面板按屏幕实时显示在线状态与最新提示状态（**未送达 / 已显示 / 已确认**）。
   投屏端收到后**全屏覆盖**显示，现场点击 **✓ 已确认** 后消失；
   投屏左下角 **🖥 显示名** 可点击改名，方便控制台区分各块大屏。

投屏页建议按 **F11** 全屏。另起一台电脑/平板做控制台时，把 `localhost` 换成本机局域网 IP 即可。

后台运行与停止：

```bash
docker compose up --build -d   # 后台
docker compose down            # 停止
```

## 本地开发（不用 Docker）

一条命令安装全部 workspace 依赖：

```bash
npm install                 # 安装 server 与 client 全部依赖
npm run dev:server          # 终端 1：服务端 http://localhost:3000（--watch 热重启）
npm run dev:client          # 终端 2：Vite 开发服务器 http://localhost:5173（/ws 自动代理到 3000）
```

开发时控制台/投屏请使用 Vite 地址 <http://localhost:5173/console>、<http://localhost:5173/display>。

生产方式本地运行（单条命令完成依赖安装、构建并启动）：

```bash
npm install && npm run build && npm start
# → http://localhost:3000
```

可通过环境变量 `PORT` 修改服务端口（默认 3000）。

## 功能与状态

- 议程维护：有序环节，每项含名称、计划开始时间（`HH:MM`）、时长与可选的 📌 **固定开始** 标记。
- 当前环节：任意一项可设为当前环节（自动载入其时长），支持开始 / 暂停 / 继续 / 重置。
- **偏差推演**：
  - 当前环节提前结束（手动进入下一环节）为负偏差、超时为正偏差；后续**普通环节**按偏差整体顺延/提前；
  - **固定环节**始终保留计划开始时间；若前序推演与其重叠，自动压缩固定环节前**最后一个普通环节**
    （可能就是当前环节），并在控制台与投屏上标红 **“时间不足”**；
  - 归零后不自动跳环节：超时量逐秒累积、后续预计开始持续后移，由控制台决定何时结束本环节。
- 投屏联播：当前环节名称、倒计时、**下一环节及其预计开始时间**；60 秒琥珀警示、归零红色全屏告警。
- **后台提示（cue）**：
  - 每块投屏**首次打开**时浏览器生成不可重复的屏幕 ID（`s-` + 32 位随机十六进制）并持久化于
    `localStorage`，页面刷新 / 断线重连 / 重启浏览器均沿用同一 ID；可为屏幕设置显示名（投屏端就地改名或控制台代改）。
  - 控制台向**一块、多块或全部在线投屏**发送预设提示（请上场 / 请加快 / 请结束）
    或不超过 **30 字**的自定义提示；每次发送生成服务端**单调递增** `cueSeq`。
  - 目标投屏**全屏覆盖**显示当前提示并可点击“已确认”；控制台按屏幕实时看到
    **未送达（离线待补发）/ 已显示 / 已确认**。
  - 目标屏断线期间的未确认提示在服务端内存排队，**重连后自动补发该屏最新一条**；
    已确认的提示不再弹出；**新提示覆盖旧提示**；迟到的旧确认严格按 `cueSeq` 比对忽略，
    不会改变新提示状态；**非目标屏不会显示或确认**。
- 投屏断线重连：重连首包即收到权威快照（含完整议程、推演结果与未确认提示），
  恢复**同一剩余时间、同一议程视图、同一条待确认提示**。
- 顶部横幅提示重连过程；重连期间数字不跳变、旧消息不会让画面回滚。

## 设计要点（对应可靠性要求）

1. **单调时钟唯一状态**：服务端用 `process.hrtime`（单调时钟）定锚。
   运行中不存“剩余秒数”，而存截止时刻 `deadlineMono`，剩余时间随时钟现算，
   不受系统时钟回拨影响；暂停时冻结剩余毫秒。议程的“已用时长/超时”用同一单调时钟度量，
   计划开始时间用与 Date/时区无关的**虚拟议程时钟**（毫秒 of-day），容器与浏览器结果一致。
2. **推演为服务端权威纯函数**：偏差顺延、固定点压缩全部在服务端 `projectAgenda` 计算后随快照下发，
   投屏/控制台不各自猜测；客户端仅在两份快照之间对超时外推做平滑插值。暂停、重连、
   控制权接管后都从同一份权威快照恢复，推演结果必然一致。
3. **递增版本快照**：每次广播的快照带严格递增的 `version` 与服务进程 `epoch`。
   投屏只接受 `version` 更高且 `epoch` 一致的快照，过期/乱序消息直接丢弃，画面永不回滚；
   `epoch` 用于区分服务端重启后的新基线。议程内容另有单调 `agenda.seq`，
   控制台保存后据此与权威快照对账，不会覆盖接管者的修改。
4. **重连恢复**：WebSocket 连接（含重连）后服务端立即发送完整快照，
   投屏以权威剩余时间为准；运行中客户端在两份快照之间用本地时钟插值平滑显示。
5. **唯一控制台 + 失联释放**：控制权是全服务唯一租约，第二个控制台申请会被拒绝；
   持有者每 5 秒发送心跳，超过 15 秒未续租即判定失联并**自动释放**，
   连接关闭同样立即释放，之后其他控制台可接管。控制台自身断线重连后会自动重新申请，
   议程草稿以重连后收到的权威快照为准。
6. **后台提示的投递与状态一致性**：提示状态机（`server/src/screens.js`）在服务端内存中
   为每块屏只保留**最新一条提示** `{ cueSeq, kind, text, status }`，状态为
   `pending`（未送达/待显示回执）→ `displayed`（投屏已全屏显示）→ `acked`（现场确认）。
   所有回执必须携带 `cueSeq` 且与该屏当前提示严格相等才生效——**迟到的旧确认/旧显示回执
   一律丢弃**，新提示（更大 seq）永远不会被旧回执改变；发送仅投递给目标屏连接，
   **非目标屏收不到任何 cue**；投屏注册（含重连、刷新）时，只要最新提示未确认就立即补发，
   已确认则不补发。屏幕与提示状态随权威快照的 `screens` 字段下发，受同一版本/epoch 守卫保护。
   屏幕 ID 由浏览器用 `crypto.getRandomValues` 生成 128 位随机数并持久化，天然不可重复，
   全程不引入任何第三方服务或外部存储。

## WebSocket 协议（`/ws`）

客户端 → 服务端：

```jsonc
{ "command": "acquire" }                     // 申请控制权
{ "command": "heartbeat" }                   // 租约心跳（5s）
{ "command": "release" }                     // 主动释放
{ "command": "set_duration", "durationMs": 300000 }
{ "command": "start" }
{ "command": "pause" }
{ "command": "resume" }
{ "command": "reset", "durationMs": 300000 } // durationMs 可省略

// 议程偏差推演（同样仅持有者可调用）
{ "command": "agenda_set", "items": [
    { "id": "a-1", "name": "开场致辞", "startMs": 33300000, // 09:15，虚拟议程时钟 ms-of-day
      "durationMs": 600000, "fixed": false } ] }            // 整体替换有序议程
{ "command": "agenda_current", "id": "a-1" } // 设定当前环节（载入其时长，回到待开始）
{ "command": "advance" }                      // 结束当前环节（提前/超时），按偏差进入下一环节

// 后台提示（投屏端指令无需控制权；cue_send / 代他人改名仅持有者）
{ "command": "screen_register", "screenId": "s-<32hex>", "name": "舞台主屏" } // 投屏连接/重连注册
{ "command": "screen_rename", "screenId": "s-<32hex>", "name": "新名称" }     // screenId 省略=改本屏
{ "command": "cue_send", "targetIds": ["s-..."], "kind": "stage" }
//   targetIds：一块/多块屏幕；[] 或缺省 = 全部在线投屏
//   kind: stage(请上场) | hurry(请加快) | end(请结束) | custom（此时 text 必填，≤30 字）
{ "command": "cue_displayed", "seq": 7 }      // 投屏回执：已全屏显示
{ "command": "cue_ack", "seq": 7 }            // 投屏回执：现场已确认（seq 不符的迟到回执被忽略）
```

服务端 → 客户端：

```jsonc
{ "type": "hello", "clientId": "c-xxxx", "epoch": "..." }
{ "type": "snapshot", "version": 42, "epoch": "...", "serverTimeMono": 0,
  "phase": "running",         // idle | running | paused | finished
  "durationMs": 300000, "remainingMs": 123456,
  "warning": false, "finished": false,
  "locked": true, "holderId": "c-xxxx",
  "agenda": {
    "seq": 3, "currentId": "a-1", "elapsedMs": 45000, "deviationMs": -15000,
    "items": [ { "id": "a-1", "name": "开场致辞", "startMs": 33300000,
                 "durationMs": 600000, "fixed": false,
                 "status": "current",   // planned | done | current | future
                 "projStartMs": 33285000, "projEndMs": 33885000,
                 "effDurationMs": 600000, "insufficient": false } ] },
  // 后台提示：控制台按屏幕查看在线状态与最新提示状态（投屏端可忽略）
  "screens": [ { "id": "s-...", "name": "舞台主屏", "online": true,
                 "cue": { "seq": 7, "kind": "stage", "text": "请上场",
                          "status": "displayed",  // pending | displayed | acked
                          "sentAtMs": 1789990000000 } } ] }
{ "type": "screen_registered", "screenId": "s-...", "name": "舞台主屏", "isNew": true }
{ "type": "screen_renamed", "screenId": "s-...", "name": "新名称" }
{ "type": "cue", "seq": 7, "kind": "custom", "text": "中场休息 10 分钟", "sentAtMs": 1789990000000 }
{ "type": "cue_sent", "seq": 7 }                 // 控制台发送回执（带回 cueSeq）
{ "type": "cue_cleared", "screenId": "s-...", "seq": 7 } // 提示已确认，同屏各连接收起覆盖层
{ "type": "control", "granted": true, "targetId": "c-xxxx" }
{ "type": "control", "granted": false, "reason": "locked|released|disconnected|timeout",
  "targetId": "c-xxxx", "holderId": "c-yyyy" }
{ "type": "heartbeat_ack" }
{ "type": "error", "code": "NOT_CONTROLLER", "message": "..." }
// 议程相关错误码：BAD_AGENDA（时间/时长非法或条目超限）、NOT_FOUND、NO_CURRENT
// 后台提示错误码：BAD_SCREEN_ID（屏幕 ID 非法）、SCREEN_NOT_FOUND（目标未注册）、
//   NO_ONLINE_SCREEN（全部在线但无在线屏）、BAD_TARGET、BAD_CUE（类型非法/空白/超长）、
//   BAD_NAME、NOT_A_SCREEN（未注册连接发回执）
```

## 目录结构

```
.
├── Dockerfile               # 多阶段构建：Vite 构建 + Node 运行
├── docker-compose.yml       # 一键启动，映射 3000 端口
├── package.json             # npm workspaces 根清单
├── server/
│   └── src/
│       ├── index.js         # HTTP 静态服务 + WebSocket 状态机/租约/提示投递
│       ├── agenda.js        # 议程偏差推演纯函数（顺延 / 固定点压缩 / 校验）
│       └── screens.js       # 屏幕注册表 + 后台提示状态机（注册/补发/覆盖/回执守卫）
└── client/
    ├── vite.config.js       # 开发代理 /ws -> localhost:3000
    └── src/
        ├── useSocket.js     # 自动重连、版本防回滚、心跳续租、投屏注册与提示收发
        ├── screenId.js      # 屏幕 ID 生成与 localStorage 持久化（刷新沿用原 ID）
        ├── time.js          # 单调时钟插值、议程时钟格式化
        ├── guard.js         # 快照版本守卫
        └── pages/           # ConsolePage / DisplayPage / HomePage / AgendaPanel / CuePanel
```

## 测试

```bash
npm test
# guard.test.mjs   快照版本守卫纯函数
# agenda.test.mjs  议程偏差推演纯函数（提前/超时/固定点压缩）
# screens.test.mjs 后台提示状态机（注册/单播多播/覆盖/迟到回执/重连补发/非目标隔离）
# e2e.mjs          WebSocket 端到端冒烟（需先启动服务端，默认端口 3000，可用 PORT 覆盖）
# lease.test.mjs   失联自动释放与接管（自带独立测试实例）
```

> 提示：`e2e.mjs` 依赖服务端初始状态（提示 `cueSeq` 从 1 开始、无已注册屏幕），
> 重新运行前请重启服务端进程；`lease.test.mjs` 会自行启动独立实例，不受影响。
