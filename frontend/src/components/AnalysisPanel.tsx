import { useState } from 'react'

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#5b8def', CS: '#00b4d8', SCS: '#2ec4b6',
  VSCS: '#e9c46a', ESCS: '#f4845f', SuCS: '#e63946',
}

const COLORS = {
  accent: '#00b4d8',
  accentLight: '#48cae4',
  glass: 'rgba(12, 18, 32, 0.7)',
  textPrimary: '#e8edf5',
  textSecondary: '#8b95a8',
  textMuted: '#5a6478',
  success: '#2ec4b6',
  warning: '#e9c46a',
  danger: '#e63946',
}

const LightningIcon = ({ size = 16, color = 'currentColor' }: { size?: number, color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
)

const WarningIcon = ({ size = 16, color = 'currentColor' }: { size?: number, color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const ShieldIcon = ({ size = 16, color = 'currentColor' }: { size?: number, color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

export default function AnalysisPanel({ storm }: { storm: any }) {
  const [activeTab, setActiveTab] = useState('intensity')

  const tabs = [
    { id: 'intensity', label: 'Intensity' },
    { id: 'ri', label: 'RI' },
    { id: 'dvorak', label: 'Dvorak' },
    { id: 'landfall', label: 'Landfall' },
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <style>{`
        .ap-container {
          background: ${COLORS.glass};
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: ${COLORS.textPrimary};
        }
        .ap-tabs {
          display: flex;
          overflow-x: auto;
          scrollbar-width: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
        }
        .ap-tabs::-webkit-scrollbar {
          display: none;
        }
        .ap-tab-btn {
          background: none;
          border: none;
          color: ${COLORS.textSecondary};
          font-size: 0.85rem;
          font-weight: 500;
          padding: 12px 16px;
          cursor: pointer;
          transition: color 0.2s ease;
          white-space: nowrap;
          position: relative;
        }
        .ap-tab-btn:hover {
          color: ${COLORS.textPrimary};
        }
        .ap-tab-btn.active {
          color: ${COLORS.accent};
        }
        .ap-tab-indicator {
          position: absolute;
          bottom: -1px;
          height: 2px;
          background: ${COLORS.accent};
          border-radius: 2px 2px 0 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ap-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .ap-metric-label {
          font-size: 0.75rem;
          color: ${COLORS.textSecondary};
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .ap-metric-value {
          font-size: 1.5rem;
          font-weight: 700;
        }
        .ap-metric-unit {
          font-size: 0.85rem;
          color: ${COLORS.textSecondary};
          margin-left: 4px;
        }
        .ap-bar-track {
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 8px;
        }
        .ap-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ap-row {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
        }
        .ap-row:last-child {
          margin-bottom: 0;
        }
        .ap-row-label {
          width: 60px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .ap-row-val {
          width: 40px;
          text-align: right;
          font-size: 0.75rem;
          font-family: monospace;
          color: ${COLORS.textPrimary};
        }
      `}</style>

      <div className="ap-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`ap-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            id={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
        {/* Simple underline indicator simulation for react without refs */}
        <div 
          className="ap-tab-indicator" 
          style={{
            width: '25%',
            left: `${tabs.findIndex(t => t.id === activeTab) * 25}%`
          }}
        />
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
        {activeTab === 'intensity' && <IntensityTab storm={storm} />}
        {activeTab === 'ri' && <RITab storm={storm} />}
        {activeTab === 'dvorak' && <DvorakTab storm={storm} />}
        {activeTab === 'landfall' && <LandfallTab storm={storm} />}
      </div>
    </div>
  )
}

function IntensityTab({ storm }: { storm: any }) {
  const color = CATEGORY_COLORS[storm?.category] || CATEGORY_COLORS.TD
  const data = storm?.intensity_data

  if (!data) return <div style={{ color: COLORS.textMuted }}>No intensity data available.</div>

  // Sort categories by probability
  const sortedCategories = Object.entries(data.category_probs || {})
    .map(([cat, prob]: [string, any]) => ({ cat, prob: Number(prob) }))
    .sort((a, b) => b.prob - a.prob)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div className="ap-card" style={{ flex: 1, margin: 0 }}>
          <div className="ap-metric-label">Max Wind (Vmax)</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="ap-metric-value" style={{ color }}>{data.vmax.mean}</span>
            <span className="ap-metric-unit">kt</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: COLORS.textMuted }}>±{data.vmax.std}</span>
          </div>
          <div className="ap-bar-track">
            <div className="ap-bar-fill" style={{ width: `${Math.min(100, (data.vmax.mean / 170) * 100)}%`, background: color }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: COLORS.textMuted, marginTop: '6px' }}>
            <span>{data.vmax.lower} kt</span>
            <span>95% CI</span>
            <span>{data.vmax.upper} kt</span>
          </div>
        </div>

        <div className="ap-card" style={{ flex: 1, margin: 0 }}>
          <div className="ap-metric-label">Min Pressure (MSLP)</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="ap-metric-value" style={{ color: COLORS.accentLight }}>{data.mslp.mean}</span>
            <span className="ap-metric-unit">hPa</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: COLORS.textMuted }}>±{data.mslp.std}</span>
          </div>
          <div className="ap-bar-track">
             <div className="ap-bar-fill" style={{ width: `${Math.max(0, Math.min(100, ((1013 - data.mslp.mean) / 100) * 100))}%`, background: COLORS.accentLight }} />
          </div>
        </div>
      </div>

      <div className="ap-card" style={{ margin: 0 }}>
        <div className="ap-metric-label">Category Probabilities</div>
        <div style={{ marginTop: '12px' }}>
          {sortedCategories.map(({ cat, prob }) => (
            <div key={cat} className="ap-row">
              <span className="ap-row-label" style={{ color: CATEGORY_COLORS[cat] || COLORS.textSecondary }}>{cat}</span>
              <div className="ap-bar-track" style={{ flex: 1, margin: '0 12px' }}>
                <div className="ap-bar-fill" style={{ width: `${prob * 100}%`, background: CATEGORY_COLORS[cat] || COLORS.textSecondary }} />
              </div>
              <span className="ap-row-val">{(prob * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ap-card" style={{ margin: 0 }}>
        <div className="ap-metric-label">Intensity Timeline</div>
        <IntensityChart data={storm?.timeline} color={color} />
      </div>
    </div>
  )
}

function RITab({ storm }: { storm: any }) {
  const ri = storm?.ri_data
  if (!ri) return <div style={{ color: COLORS.textMuted }}>No RI data available.</div>

  const prob = ri.probability?.mean || 0
  const color = prob > 0.6 ? COLORS.danger : prob > 0.3 ? COLORS.warning : COLORS.success
  const alertText = prob > 0.6 ? 'HIGH ALERT' : prob > 0.3 ? 'ELEVATED RISK' : 'LOW RISK'
  
  const circumference = 2 * Math.PI * 45
  const offset = circumference * (1 - prob)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="ap-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
        <div style={{ position: 'relative', width: '120px', height: '120px' }}>
          <svg viewBox="0 0 100 100" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
          </svg>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color }}>{(prob * 100).toFixed(0)}%</span>
            <span style={{ fontSize: '0.65rem', color: COLORS.textSecondary, textTransform: 'uppercase' }}>RI 24h</span>
          </div>
        </div>

        <div style={{ 
          marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px',
          background: `${color}15`, color: color, padding: '6px 12px', borderRadius: '100px',
          fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em'
        }}>
          <LightningIcon size={14} />
          {alertText}
        </div>
        
        <div style={{ fontSize: '0.65rem', color: COLORS.textMuted, marginTop: '12px', textAlign: 'center' }}>
          P(ΔVmax ≥ 35kt in next 24h)<br/>
          Uncertainty: ±{((ri.probability?.std || 0) * 100).toFixed(0)}%
        </div>
      </div>

      <div className="ap-card" style={{ margin: 0 }}>
        <div className="ap-metric-label">Contributing Factors</div>
        <div style={{ marginTop: '12px' }}>
          {Object.entries(ri.factors || {}).map(([name, value]: [string, any]) => {
            const isFavorableLow = name === 'Wind Shear'
            const v = Number(value)
            const factorColor = (isFavorableLow ? (v < 0.4 ? COLORS.success : v > 0.7 ? COLORS.danger : COLORS.warning) 
                                                : (v > 0.7 ? COLORS.success : v > 0.4 ? COLORS.warning : COLORS.danger))
            return (
              <div key={name} className="ap-row">
                <span className="ap-row-label" style={{ width: '80px', color: COLORS.textPrimary }}>
                  {name}
                </span>
                <div className="ap-bar-track" style={{ flex: 1, margin: '0 12px' }}>
                  <div className="ap-bar-fill" style={{ width: `${v * 100}%`, background: factorColor }} />
                </div>
                <span className="ap-row-val">{(v * 100).toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DvorakTab({ storm }: { storm: any }) {
  if (!storm?.dvorak_pattern) return <div style={{ color: COLORS.textMuted }}>No Dvorak data.</div>

  const tNum = storm.t_number || 1.0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="ap-card" style={{ textAlign: 'center' }}>
        <div className="ap-metric-label">Current Pattern</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COLORS.accentLight, margin: '8px 0' }}>
          {storm.dvorak_pattern}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(46, 196, 182, 0.15)', color: COLORS.success, padding: '4px 10px', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 600 }}>
          <ShieldIcon size={12} />
          High Confidence
        </div>
      </div>

      <div className="ap-card">
        <div className="ap-metric-label">T-Number (Dvorak)</div>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="ap-metric-value" style={{ color: COLORS.accent }}>{tNum.toFixed(1)}</span>
          <span className="ap-metric-unit">/ 8.0</span>
        </div>
        <div className="ap-bar-track" style={{ height: '8px' }}>
          <div className="ap-bar-fill" style={{ 
            width: `${((tNum - 1) / 7) * 100}%`, 
            background: `linear-gradient(90deg, ${COLORS.accentLight}, ${COLORS.accent})`
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: COLORS.textMuted, marginTop: '8px' }}>
          <span>1.0 (TD)</span>
          <span>8.0 (SuCS)</span>
        </div>
      </div>

      <div className="ap-card" style={{ margin: 0 }}>
        <div className="ap-metric-label">Pattern Classes</div>
        <div style={{ marginTop: '12px' }}>
          {['CDO', 'Eyewall', 'Eye', 'Banding', 'Shear'].map((cls, i) => {
            const pColors = ['#06b6d4', '#8b5cf6', '#2ec4b6', '#e9c46a', '#e63946']
            const probs = storm.dvorak_pattern === 'Eye' 
              ? [0.08, 0.15, 0.87, 0.02, 0.01] 
              : [0.79, 0.08, 0.07, 0.05, 0.01]
            return (
              <div key={cls} className="ap-row">
                <span className="ap-row-label" style={{ color: pColors[i] }}>{cls}</span>
                <div className="ap-bar-track" style={{ flex: 1, margin: '0 12px' }}>
                  <div className="ap-bar-fill" style={{ width: `${probs[i] * 100}%`, background: pColors[i] }} />
                </div>
                <span className="ap-row-val">{(probs[i] * 100).toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LandfallTab({ storm }: { storm: any }) {
  const risks = [...(storm?.landfall_risk || [])].sort((a: any, b: any) => b.probability - a.probability)

  if (!risks.length) return <div style={{ color: COLORS.textMuted }}>No landfall risks assessed.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="ap-card" style={{ 
        background: 'linear-gradient(135deg, rgba(230, 57, 70, 0.1), transparent)',
        border: `1px solid ${COLORS.danger}40`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLORS.danger, fontWeight: 700, fontSize: '0.8rem', marginBottom: '8px' }}>
          <WarningIcon size={16} />
          Landfall Assessment
        </div>
        <div style={{ fontSize: '0.75rem', color: COLORS.textSecondary, lineHeight: 1.5 }}>
          Probabilities computed from intersection of 90% probability cone with coastal district boundaries.
          <div style={{ marginTop: '8px', color: COLORS.textPrimary, fontWeight: 600 }}>
            Expected landfall: {storm.track ? `+${storm.track.find((p: any) => p.t > 24 && p.lat > 20)?.t || 36}h` : '+36h'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {risks.map((risk: any) => {
          const prob = risk.probability
          const barColor = prob > 0.5 ? COLORS.danger : prob > 0.3 ? COLORS.warning : COLORS.success
          return (
            <div key={risk.district} className="ap-card" style={{ padding: '12px', margin: 0, borderLeft: `4px solid ${barColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: COLORS.textPrimary }}>{risk.district}</div>
                  <div style={{ fontSize: '0.65rem', color: COLORS.textMuted, marginTop: '2px' }}>{risk.state}</div>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: barColor, fontFamily: 'monospace' }}>
                  {(prob * 100).toFixed(0)}%
                </div>
              </div>
              <div className="ap-bar-track" style={{ marginTop: '10px' }}>
                <div className="ap-bar-fill" style={{ width: `${prob * 100}%`, background: barColor }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IntensityChart({ data, color }: { data: any; color: string }) {
  if (!data || !data.timestamps) return <div style={{ color: COLORS.textMuted, fontSize: '0.75rem' }}>No timeline data available.</div>

  const { timestamps, vmax, vmaxUpper, vmaxLower } = data
  const n = timestamps.length
  const width = 320
  const height = 140
  const pad = { top: 10, right: 10, bottom: 25, left: 35 }

  const minV = Math.min(...vmaxLower) - 5
  const maxV = Math.max(...vmaxUpper) + 5
  const minT = timestamps[0]
  const maxT = timestamps[n - 1]

  const scaleX = (t: number) => pad.left + ((t - minT) / (maxT - minT)) * (width - pad.left - pad.right)
  const scaleY = (v: number) => pad.top + ((maxV - v) / (maxV - minV)) * (height - pad.top - pad.bottom)

  const upperPath = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${scaleX(t)},${scaleY(vmaxUpper[i])}`).join(' ')
  const lowerPath = [...timestamps].reverse().map((t: number, i: number) => `L${scaleX(t)},${scaleY(vmaxLower[n - 1 - i])}`).join(' ')
  const mainPath = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${scaleX(t)},${scaleY(vmax[i])}`).join(' ')

  const zeroIdx = timestamps.indexOf(0)
  const zeroX = zeroIdx >= 0 ? scaleX(0) : scaleX(minT)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', marginTop: '12px' }}>
      <rect x="0" y="0" width={width} height={height} fill="transparent" />

      {/* Grid */}
      {[30, 65, 90, 120].map(v => (
        <g key={v}>
          <line x1={pad.left} y1={scaleY(v)} x2={width - pad.right} y2={scaleY(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={pad.left - 6} y={scaleY(v) + 3} fill={COLORS.textMuted} fontSize="8" textAnchor="end">{v}</text>
        </g>
      ))}

      {/* Now line */}
      <line x1={zeroX} y1={pad.top} x2={zeroX} y2={height - pad.bottom} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4" />
      <text x={zeroX} y={height - 4} fill={COLORS.textSecondary} fontSize="8" textAnchor="middle" fontWeight="700">NOW</text>

      {/* Confidence Band */}
      <path d={`${upperPath} ${lowerPath} Z`} fill={`${color}20`} />

      {/* Main Path */}
      <path d={mainPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Animated Dot for NOW */}
      {zeroIdx >= 0 && (
        <circle cx={scaleX(0)} cy={scaleY(vmax[zeroIdx])} r="4" fill={color}>
          <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Axis Labels */}
      <text x={pad.left + 4} y={height - 4} fill={COLORS.textMuted} fontSize="8">
        -{timestamps.length > 12 ? '72' : '48'}h
      </text>
      <text x={width - pad.right} y={height - 4} fill={COLORS.textMuted} fontSize="8" textAnchor="end">
        +{timestamps.length > 12 ? '48' : '24'}h
      </text>
      <text x={pad.left - 6} y={pad.top + 4} fill={COLORS.textMuted} fontSize="7" textAnchor="end">kt</text>
    </svg>
  )
}
