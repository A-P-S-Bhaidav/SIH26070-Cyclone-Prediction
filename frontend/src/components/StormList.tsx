/**
 * StormList — Left sidebar showing tracked cyclones.
 */
const CATEGORY_COLORS: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981',
  VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}

export default function StormList({
  cyclones, selectedId, onSelect,
}: {
  cyclones: any[]; selectedId: string; onSelect: (id: string) => void
}) {
  return (
    <div>
      <div className="panel-section-title">Tracked Storms · NIO Basin</div>

      {cyclones.map((storm) => {
        const color = CATEGORY_COLORS[storm.category] || '#3b82f6'
        const isActive = storm.storm_id === selectedId
        return (
          <div
            key={storm.storm_id}
            className={`storm-card ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(storm.storm_id)}
            style={isActive ? { borderLeftColor: color } : undefined}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="storm-name">{storm.storm_name}</div>
                <div className="storm-coords">
                  {storm.position.lat.toFixed(1)}°N, {storm.position.lon.toFixed(1)}°E
                </div>
              </div>
              <span
                className="cat-badge"
                style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
              >
                {storm.category}
              </span>
            </div>

            <div className="storm-stats">
              <div>
                <div className="storm-stat-label">Vmax</div>
                <div className="storm-stat-val" style={{ color }}>
                  {storm.vmax_kt}<span className="storm-stat-unit">kt</span>
                </div>
              </div>
              <div>
                <div className="storm-stat-label">MSLP</div>
                <div className="storm-stat-val">
                  {storm.mslp_hpa}<span className="storm-stat-unit">hPa</span>
                </div>
              </div>
            </div>

            {storm.ri_probability > 0.3 && (
              <div
                className="ri-alert"
                style={{
                  background: storm.ri_probability > 0.7 ? '#fee2e2' : storm.ri_probability > 0.5 ? '#fef3c7' : '#e0f2fe',
                  color: storm.ri_probability > 0.7 ? '#ef4444' : storm.ri_probability > 0.5 ? '#f59e0b' : '#0ea5e9',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                RI Probability {(storm.ri_probability * 100).toFixed(0)}%
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.6rem' }}>in 24h</span>
              </div>
            )}
          </div>
        )
      })}

      <div className="panel-section-title" style={{ marginTop: '8px' }}>Genesis Watch</div>
      <div className="genesis-card">
        <div className="genesis-title">Bay of Bengal +48h</div>
        <div className="genesis-text">
          Low-pressure area at 11.5°N, 85.0°E shows 42% genesis probability.
          Monitoring for convective organization.
        </div>
      </div>
    </div>
  )
}
