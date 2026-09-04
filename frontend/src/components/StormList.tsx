/**
 * Storm list sidebar — shows all tracked cyclones.
 */

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#6366f1',
  CS: '#06b6d4',
  SCS: '#22c55e',
  VSCS: '#eab308',
  ESCS: '#f97316',
  SuCS: '#ef4444',
}

export default function StormList({
  cyclones,
  selectedId,
  onSelect,
}: {
  cyclones: any[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <div className="section-header">
        <span className="section-title">Tracked Storms</span>
        <span style={{
          fontSize: '0.65rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          NIO Basin
        </span>
      </div>

      {cyclones.map((storm) => {
        const catKey = storm.category.toLowerCase()
        const color = CATEGORY_COLORS[storm.category] || '#6366f1'
        const isActive = storm.storm_id === selectedId

        return (
          <div
            key={storm.storm_id}
            className={`glass-card storm-card category-${catKey} ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(storm.storm_id)}
            style={{
              borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
              background: isActive
                ? `linear-gradient(135deg, ${color}10, transparent)`
                : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="storm-name" style={{ color: isActive ? color : 'var(--text-primary)' }}>
                  {storm.storm_name}
                </div>
                <div className="storm-meta">
                  <span>{storm.position.lat.toFixed(1)}°N, {storm.position.lon.toFixed(1)}°E</span>
                </div>
              </div>
              <span
                className={`category-badge ${catKey}`}
                style={{ background: `${color}20`, color }}
              >
                {storm.category}
              </span>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '8px', marginTop: '10px',
            }}>
              <div>
                <div style={{
                  fontSize: '0.6rem', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
                }}>
                  Vmax
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '1.1rem',
                  fontWeight: 800, color: color,
                }}>
                  {storm.vmax_kt}
                  <span style={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}> kt</span>
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: '0.6rem', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
                }}>
                  MSLP
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '1.1rem',
                  fontWeight: 800,
                }}>
                  {storm.mslp_hpa}
                  <span style={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}> hPa</span>
                </div>
              </div>
            </div>

            {/* RI Alert */}
            {storm.ri_probability > 0.3 && (
              <div style={{
                marginTop: '8px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: storm.ri_probability > 0.7
                  ? 'rgba(239, 68, 68, 0.1)'
                  : storm.ri_probability > 0.5
                    ? 'rgba(249, 115, 22, 0.1)'
                    : 'rgba(245, 158, 11, 0.1)',
                fontSize: '0.65rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '6px',
                color: storm.ri_probability > 0.7 ? '#ef4444' :
                       storm.ri_probability > 0.5 ? '#f97316' : '#f59e0b',
              }}>
                ⚠️ RI {(storm.ri_probability * 100).toFixed(0)}%
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>in 24h</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Genesis Watch */}
      <div style={{ marginTop: '20px' }}>
        <div className="section-header">
          <span className="section-title">Genesis Watch</span>
        </div>
        <div className="glass-card" style={{
          padding: '12px',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), transparent)',
          border: '1px solid rgba(6, 182, 212, 0.15)',
        }}>
          <div style={{
            fontSize: '0.72rem', fontWeight: 600,
            color: 'var(--accent-cyan)', marginBottom: '4px',
          }}>
            Bay of Bengal +48h
          </div>
          <div style={{
            fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4,
          }}>
            Low-pressure area at 11.5°N, 85.0°E shows 42% genesis probability.
            Monitoring for convective organization.
          </div>
        </div>
      </div>
    </div>
  )
}
