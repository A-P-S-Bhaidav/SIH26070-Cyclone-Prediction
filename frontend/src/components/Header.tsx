/**
 * Header component with branding, live status, and storm count.
 */

export default function Header({ isLive, stormCount }: { isLive: boolean; stormCount: number }) {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Logo */}
        <div style={{
          width: 36, height: 36, borderRadius: '10px',
          background: 'var(--gradient-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.2rem', fontWeight: 900,
          boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
        }}>
          🌀
        </div>
        <div>
          <h1 style={{
            fontSize: '1.05rem', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            <span className="text-gradient">CycloneAI</span>
          </h1>
          <p style={{
            fontSize: '0.6rem', color: 'var(--text-muted)',
            fontWeight: 500, letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            SIH26070 • NIO Prediction System
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Storm count badge */}
        <div style={{
          padding: '6px 14px',
          background: 'rgba(99, 102, 241, 0.12)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '20px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--accent-primary)',
            color: 'white', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800,
          }}>
            {stormCount}
          </span>
          Active Storms
        </div>

        {/* Live indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px',
          background: isLive ? 'rgba(34, 197, 94, 0.12)' : 'rgba(249, 115, 22, 0.12)',
          border: `1px solid ${isLive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.2)'}`,
          borderRadius: '20px',
          fontSize: '0.72rem', fontWeight: 600,
          color: isLive ? 'var(--accent-green)' : '#f97316',
        }}>
          <span className={isLive ? 'live-dot' : ''} style={!isLive ? {
            width: 8, height: 8, borderRadius: '50%',
            background: '#f97316', display: 'inline-block',
          } : undefined} />
          {isLive ? 'LIVE' : 'DEMO'}
        </div>

        {/* Time */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
        }}>
          {new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit',
            timeZoneName: 'short',
          })}
        </div>
      </div>
    </header>
  )
}
