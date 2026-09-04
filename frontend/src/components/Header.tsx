

export default function Header({ isLive, stormCount }: { isLive: boolean; stormCount: number }) {
  return (
    <>
      <style>{`
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: var(--bg-card, rgba(12, 18, 32, 0.85));
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          color: var(--text-primary, #e8edf5);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .logo-container {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--accent-primary, #00b4d8), #0077b6);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0, 180, 216, 0.3);
        }
        .logo-text-container {
          display: flex;
          flex-direction: column;
        }
        .logo-title {
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0;
          background: linear-gradient(to right, #ffffff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .logo-subtitle {
          font-size: 0.65rem;
          color: var(--text-muted, #5a6478);
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0;
          margin-top: 2px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .status-badge {
          padding: 6px 14px;
          background: rgba(0, 180, 216, 0.1);
          border: 1px solid rgba(0, 180, 216, 0.2);
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent-primary, #00b4d8);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-badge-count {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent-primary, #00b4d8);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 800;
        }
        .live-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .live-indicator.live {
          background: rgba(46, 196, 182, 0.1);
          border: 1px solid rgba(46, 196, 182, 0.2);
          color: var(--success-green, #2ec4b6);
        }
        .live-indicator.demo {
          background: rgba(244, 132, 95, 0.1);
          border: 1px solid rgba(244, 132, 95, 0.2);
          color: var(--warning-orange, #f4845f);
        }
        .time-display {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.75rem;
          color: var(--text-muted, #5a6478);
          font-weight: 500;
        }
        .menu-toggle {
          display: none;
          background: none;
          border: none;
          color: var(--text-primary, #e8edf5);
          cursor: pointer;
          padding: 4px;
        }
        
        @media (max-width: 768px) {
          .app-header {
            padding: 12px 16px;
          }
          .menu-toggle {
            display: block;
          }
          .logo-subtitle, .time-display {
            display: none;
          }
          .header-right {
            gap: 12px;
          }
          .status-badge span {
            display: none;
          }
        }
      `}</style>
      <header className="app-header">
        <div className="header-left">
          <button className="menu-toggle" aria-label="Toggle menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          
          <div className="logo-container">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="M4.93 4.93l1.41 1.41" />
              <path d="M17.66 17.66l1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="M4.93 19.07l1.41-1.41" />
              <path d="M17.66 6.34l1.41-1.41" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </div>
          
          <div className="logo-text-container">
            <h1 className="logo-title">CycloneAI</h1>
            <p className="logo-subtitle">SIH26070 • NIO Prediction System</p>
          </div>
        </div>

        <div className="header-right">
          <div className="status-badge">
            <div className="status-badge-count">{stormCount}</div>
            <span>Active Storms</span>
          </div>

          <div className={`live-indicator ${isLive ? 'live' : 'demo'}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="5" cy="5" r="4" fill="currentColor" opacity="0.3" />
              <circle cx="5" cy="5" r="2.5" fill="currentColor" />
            </svg>
            {isLive ? 'LIVE' : 'DEMO'}
          </div>

          <div className="time-display">
            {new Date().toLocaleTimeString('en-US', { 
              hour: '2-digit', minute: '2-digit',
              timeZoneName: 'short',
            })}
          </div>
        </div>
      </header>
    </>
  )
}
