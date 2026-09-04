

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#5b8def',
  CS: '#00b4d8',
  SCS: '#2ec4b6',
  VSCS: '#e9c46a',
  ESCS: '#f4845f',
  SuCS: '#e63946',
}

interface Position {
  lat: number;
  lon: number;
}

interface Storm {
  storm_id: string;
  storm_name: string;
  category: string;
  position: Position;
  vmax_kt: number;
  mslp_hpa: number;
  ri_probability: number;
}

interface StormListProps {
  cyclones: Storm[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function StormList({
  cyclones,
  selectedId,
  onSelect,
}: StormListProps) {
  return (
    <>
      <style>{`
        .storm-list-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 8px;
        }
        .section-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary, #e8edf5);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .section-subtitle {
          font-size: 0.65rem;
          color: var(--text-muted, #5a6478);
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        }
        
        .storm-card-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .storm-card {
          background: var(--bg-card, rgba(12, 18, 32, 0.85));
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }
        .storm-card:hover {
          background: rgba(255, 255, 255, 0.09);
        }
        
        .storm-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .storm-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary, #e8edf5);
          margin-bottom: 4px;
        }
        .storm-meta {
          font-size: 0.75rem;
          color: var(--text-muted, #5a6478);
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        }
        .category-badge {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          background: rgba(0, 0, 0, 0.2);
          padding: 10px;
          border-radius: 8px;
        }
        .metric-label {
          font-size: 0.65rem;
          color: var(--text-muted, #5a6478);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .metric-value {
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary, #e8edf5);
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        .metric-unit {
          font-size: 0.65rem;
          font-weight: 500;
          color: var(--text-muted, #5a6478);
        }
        
        .ri-alert {
          margin-top: 12px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .genesis-watch-card {
          background: linear-gradient(135deg, rgba(0, 180, 216, 0.08), transparent);
          border: 1px solid rgba(0, 180, 216, 0.2);
          border-radius: 12px;
          padding: 16px;
        }
        .genesis-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--accent-primary, #00b4d8);
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .genesis-desc {
          font-size: 0.75rem;
          color: var(--text-muted, #5a6478);
          line-height: 1.5;
        }
        
        @media (max-width: 768px) {
          .storm-card-list {
            flex-direction: row;
            overflow-x: auto;
            padding-bottom: 8px;
            scroll-snap-type: x mandatory;
          }
          .storm-card {
            min-width: 260px;
            scroll-snap-align: start;
            flex-shrink: 0;
          }
        }
      `}</style>
      <div className="storm-list-container">
        <div>
          <div className="section-header">
            <span className="section-title">Tracked Storms</span>
            <span className="section-subtitle">NIO Basin</span>
          </div>

          <div className="storm-card-list">
            {cyclones.map((storm) => {
              const color = CATEGORY_COLORS[storm.category] || '#5b8def'
              const isActive = storm.storm_id === selectedId

              return (
                <div
                  key={storm.storm_id}
                  className="storm-card"
                  onClick={() => onSelect(storm.storm_id)}
                  style={{
                    borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                    background: isActive ? `linear-gradient(135deg, ${color}15, rgba(12, 18, 32, 0.9))` : undefined,
                  }}
                >
                  <div className="storm-card-header">
                    <div>
                      <div className="storm-name" style={{ color: isActive ? color : 'var(--text-primary, #e8edf5)' }}>
                        {storm.storm_name}
                      </div>
                      <div className="storm-meta">
                        {storm.position.lat.toFixed(1)}°N, {storm.position.lon.toFixed(1)}°E
                      </div>
                    </div>
                    <div className="category-badge" style={{ background: `${color}20`, color }}>
                      {storm.category}
                    </div>
                  </div>

                  <div className="metrics-grid">
                    <div>
                      <div className="metric-label">Vmax</div>
                      <div className="metric-value" style={{ color }}>
                        {storm.vmax_kt}
                        <span className="metric-unit">kt</span>
                      </div>
                    </div>
                    <div>
                      <div className="metric-label">MSLP</div>
                      <div className="metric-value">
                        {storm.mslp_hpa}
                        <span className="metric-unit">hPa</span>
                      </div>
                    </div>
                  </div>

                  {storm.ri_probability > 0.3 && (
                    <div className="ri-alert" style={{
                      background: storm.ri_probability > 0.7
                        ? 'rgba(230, 57, 70, 0.1)'
                        : storm.ri_probability > 0.5
                          ? 'rgba(244, 132, 95, 0.1)'
                          : 'rgba(233, 196, 106, 0.1)',
                      color: storm.ri_probability > 0.7 ? '#e63946' :
                             storm.ri_probability > 0.5 ? '#f4845f' : '#e9c46a',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      RI {(storm.ri_probability * 100).toFixed(0)}%
                      <span style={{ color: 'var(--text-muted, #5a6478)', fontWeight: 500, fontSize: '0.7rem' }}>in 24h</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop: '8px' }}>
          <div className="section-header">
            <span className="section-title">Genesis Watch</span>
          </div>
          <div className="genesis-watch-card">
            <div className="genesis-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Bay of Bengal +48h
            </div>
            <div className="genesis-desc">
              Low-pressure area at 11.5°N, 85.0°E shows 42% genesis probability.
              Monitoring for convective organization.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
