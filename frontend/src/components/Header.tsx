/**
 * Header — Vayu Netra branding with theme toggle.
 */
export default function Header({ isLive, stormCount, theme, onToggleTheme }: {
  isLive: boolean; stormCount: number; theme: string; onToggleTheme: () => void
}) {
  return (
    <header className="app-header">
      <div className="logo-group">
        <img src="/favicon.jpg" alt="Vayu Netra" className="logo-img" />
        <span className="logo-text">Vayu Netra</span>
      </div>
      <div className="header-right">
        <div className="storm-count-pill">
          <span className="storm-count-num">{stormCount}</span>
          Active
        </div>
        <div className={`status-pill ${isLive ? 'live' : 'demo'}`}>
          <span className={`status-dot ${isLive ? 'live' : 'demo'}`} />
          {isLive ? 'LIVE' : 'DEMO'}
        </div>
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          )}
        </button>
      </div>
    </header>
  )
}
