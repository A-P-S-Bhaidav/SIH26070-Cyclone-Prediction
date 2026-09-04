/**
 * Header — Professional navy top bar with branding and status.
 */
export default function Header({ isLive, stormCount }: { isLive: boolean; stormCount: number }) {
  return (
    <header className="app-header">
      <div className="logo-group">
        <div className="logo-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
            <path d="M12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6" />
            <path d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2" />
          </svg>
        </div>
        <div>
          <div className="logo-text">CycloneAI</div>
          <div className="logo-sub">SIH26070 · NIO Prediction System</div>
        </div>
      </div>

      <div className="header-right">
        <div className="storm-count-pill">
          <span className="storm-count-num">{stormCount}</span>
          Active Storms
        </div>
        <div className={`status-pill ${isLive ? 'live' : 'demo'}`}>
          <span className={`status-dot ${isLive ? 'live' : 'demo'}`} />
          {isLive ? 'LIVE' : 'DEMO'}
        </div>
        <span className="header-time">
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
        </span>
      </div>
    </header>
  )
}
