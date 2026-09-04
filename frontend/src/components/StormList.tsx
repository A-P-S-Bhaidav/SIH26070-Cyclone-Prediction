/**
 * StormList — Compact storm list with separated Genesis Watch at bottom.
 */
const SEV: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981', VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}

export default function StormList({ cyclones, selectedId, onSelect }: {
  cyclones: any[]; selectedId: string; onSelect: (id: string) => void
}) {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="panel-section-title">Tracked Storms</div>
        {cyclones.map((s) => {
          const c = SEV[s.category] || '#3b82f6'
          const act = s.storm_id === selectedId
          return (
            <div key={s.storm_id} className={`storm-card ${act ? 'active' : ''}`}
              onClick={() => onSelect(s.storm_id)}
              style={act ? { borderLeftColor: c } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="storm-name">{s.storm_name}</div>
                  <div className="storm-coords">{s.position.lat.toFixed(1)}°N, {s.position.lon.toFixed(1)}°E</div>
                </div>
                <span className="cat-badge" style={{ background: `${c}15`, color: c, border: `1px solid ${c}35` }}>{s.category}</span>
              </div>
              <div className="storm-stats">
                <div>
                  <div className="storm-stat-label">Vmax</div>
                  <div className="storm-stat-val" style={{ color: c }}>{s.vmax_kt}<span className="storm-stat-unit">kt</span></div>
                </div>
                <div>
                  <div className="storm-stat-label">MSLP</div>
                  <div className="storm-stat-val">{s.mslp_hpa}<span className="storm-stat-unit">hPa</span></div>
                </div>
              </div>
              {s.ri_probability > 0.3 && (
                <div className="ri-alert" style={{
                  background: s.ri_probability > 0.7 ? 'var(--red-100)' : s.ri_probability > 0.5 ? 'var(--amber-100)' : 'var(--sky-100)',
                  color: s.ri_probability > 0.7 ? 'var(--red-500)' : s.ri_probability > 0.5 ? 'var(--amber-500)' : 'var(--sky-500)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  RI {(s.ri_probability * 100).toFixed(0)}% in 24h
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="genesis-section">
        <div className="panel-section-title">Genesis Watch</div>
        <div className="genesis-card">
          <div className="genesis-title">Bay of Bengal +48h</div>
          <div className="genesis-text">Low-pressure area at 11.5°N, 85.0°E — 42% genesis probability. Monitoring convective organization.</div>
        </div>
      </div>
    </>
  )
}
