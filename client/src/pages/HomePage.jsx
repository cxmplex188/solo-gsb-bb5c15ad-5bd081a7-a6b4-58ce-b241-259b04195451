export default function HomePage() {
  return (
    <div className="home">
      <h1>会场发言计时</h1>
      <p className="subtitle">单控制台 · 多屏联播 · 议程偏差推演 · 后台提示 · WebSocket 实时同步</p>
      <div className="home-cards">
        <a className="card card-console" href="/console">
          <span className="card-title">控制台</span>
          <span className="card-desc">
            维护有序议程（名称 / 计划开始 / 时长 / 固定标记），设定当前环节，
            开始 / 暂停 / 继续 / 提前结束 / 超时顺延，持有唯一控制权；
            可向一块、多块或全部在线投屏发送“请上场/加快/结束”等后台提示
          </span>
        </a>
        <a className="card card-display" href="/display">
          <span className="card-title">投屏页</span>
          <span className="card-desc">
            大屏倒计时，同步显示当前环节与下一环节预计开始时间，
            超时顺延、固定环节“时间不足”醒目提示，断线自动恢复；
            可接收控制台的“请上场/加快/结束”等后台提示并全屏确认
          </span>
        </a>
      </div>
      <p className="tip">投屏页建议浏览器按 F11 进入全屏；可在多块屏幕同时打开。</p>
    </div>
  );
}
