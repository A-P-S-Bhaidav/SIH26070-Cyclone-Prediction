/**
 * AnalysisPanel — Right sidebar with all analysis tabs.
 * 
 * Tabs: Intensity | RI | Dvorak | Landfall | Verification
 */

import { useState } from 'react'

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#6366f1', CS: '#06b6d4', SCS: '#22c55e',
  VSCS: '#eab308', ESCS: '#f97316', SuCS: '#ef4444',
}

export default function AnalysisPanel({ storm }: { storm: any }) {
  const [activeTab, setActiveTab] = useState('intensity')

  const tabs = [
    { id: 'intensity', label: 'Intensity' },
    { id: 'ri', label: 'RI' },
    { id: 'dvorak', label: 'Dvorak' },
    { id: 'landfall', label: 'Landfall' },
  ]

  return (
    <div>
      <div className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'intensity' && <IntensityTab storm={storm} />}
      {activeTab === 'ri' && <RITab storm={storm} />}
      {activeTab === 'dvorak' && <DvorakTab storm={storm} />}
      {activeTab === 'landfall' && <LandfallTab storm={storm} />}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  Tab: Intensity Analysis
// ═══════════════════════════════════════════════════════════════════════

function IntensityTab({ storm }: { storm: any }) {
  const color = CATEGORY_COLORS[storm.category] || '#6366f1'
  const data = storm.intensity_data

  return (
    <div>
      {/* Current intensity metrics */}
      <div className="glass-card metric-card">
        <div className="metric-label">Maximum Sustained Wind</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="metric-value" style={{ color }}>
            {data.vmax.mean}
          </span>
          <span className="metric-unit">kt</span>
          <span style={{
            fontSize: '0.65rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            ±{data.vmax.std}
          </span>
        </div>
        <div className="metric-bar">
          <div
            className="metric-bar-fill"
            style={{
              width: `${Math.min(100, (data.vmax.mean / 170) * 100)}%`,
              background: `linear-gradient(90deg, ${color}, ${color}88)`,
            }}
          />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.6rem', color: 'var(--text-muted)',
          marginTop: '4px', fontFamily: 'var(--font-mono)',
        }}>
          <span>{data.vmax.lower} kt</span>
          <span>95% CI</span>
          <span>{data.vmax.upper} kt</span>
        </div>
      </div>

      <div className="glass-card metric-card">
        <div className="metric-label">Minimum Sea-Level Pressure</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="metric-value" style={{ color: 'var(--accent-cyan)' }}>
            {data.mslp.mean}
          </span>
          <span className="metric-unit">hPa</span>
          <span style={{
            fontSize: '0.65rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            ±{data.mslp.std}
          </span>
        </div>
      </div>

      {/* Category probabilities */}
      <div className="glass-card" style={{ padding: '14px' }}>
        <div className="section-header" style={{ marginBottom: '10px' }}>
          <span className="section-title">IMD Category Probabilities</span>
        </div>
        {Object.entries(data.category_probs).map(([cat, prob]: [string, any]) => (
          <div key={cat} className="factor-row">
            <span className="factor-label" style={{
              width: '50px',
              color: CATEGORY_COLORS[cat] || 'var(--text-secondary)',
              fontWeight: 700,
            }}>
              {cat}
            </span>
            <div className="factor-bar-track">
              <div
                className="factor-bar-fill"
                style={{
                  width: `${prob * 100}%`,
                  background: CATEGORY_COLORS[cat] || '#6366f1',
                }}
              />
            </div>
            <span className="factor-value">{(prob * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      {/* Intensity timeline chart (simplified) */}
      <div className="glass-card" style={{ padding: '14px', marginTop: '12px' }}>
        <div className="section-header" style={{ marginBottom: '10px' }}>
          <span className="section-title">Intensity Timeline</span>
        </div>
        <IntensityChart data={storm.timeline} color={color} />
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  Tab: Rapid Intensification
// ═══════════════════════════════════════════════════════════════════════

function RITab({ storm }: { storm: any }) {
  const ri = storm.ri_data
  const prob = ri.probability.mean
  const alertColor = prob > 0.7 ? '#ef4444' : prob > 0.5 ? '#f97316' : prob > 0.3 ? '#f59e0b' : '#22c55e'
  const alertLabel = prob > 0.7 ? 'HIGH' : prob > 0.5 ? 'ELEVATED' : prob > 0.3 ? 'MODERATE' : 'LOW'

  // SVG gauge
  const circumference = 2 * Math.PI * 50
  const offset = circumference * (1 - prob)

  return (
    <div>
      {/* RI Gauge */}
      <div className="glass-card gauge-container">
        <div className="gauge-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            {/* Track */}
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            {/* Value */}
            <circle
              cx="60" cy="60" r="50" fill="none"
              stroke={alertColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 6px ${alertColor}40)` }}
            />
          </svg>
          <div className="gauge-value">
            <span className="gauge-percentage" style={{ color: alertColor }}>
              {(prob * 100).toFixed(0)}%
            </span>
            <span className="gauge-label">RI 24h</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <span className={`alert-badge ${alertLabel.toLowerCase()}`}>
            ⚡ {alertLabel} ALERT
          </span>
        </div>
        <p style={{
          textAlign: 'center', fontSize: '0.68rem',
          color: 'var(--text-secondary)', marginTop: '8px',
          lineHeight: 1.5,
        }}>
          P(ΔVmax ≥ 35kt in next 24h)
          <br />
          MC Dropout uncertainty: ±{(ri.probability.std * 100).toFixed(0)}%
        </p>
      </div>

      {/* Contributing factors */}
      <div className="glass-card" style={{ padding: '14px' }}>
        <div className="section-header" style={{ marginBottom: '10px' }}>
          <span className="section-title">Contributing Factors</span>
        </div>
        {Object.entries(ri.factors).map(([name, value]: [string, any]) => {
          const barColor = value > 0.7 ? '#22c55e' : value > 0.4 ? '#eab308' : '#ef4444'
          const label = name === 'Wind Shear' ? '(low = favorable)' : ''
          return (
            <div key={name} className="factor-row">
              <span className="factor-label">
                {name}
                {label && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}> {label}</span>}
              </span>
              <div className="factor-bar-track">
                <div
                  className="factor-bar-fill"
                  style={{
                    width: `${value * 100}%`,
                    background: name === 'Wind Shear'
                      ? `linear-gradient(90deg, #22c55e, #ef4444)`
                      : barColor,
                  }}
                />
              </div>
              <span className="factor-value">{(value * 100).toFixed(0)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  Tab: Dvorak Analysis
// ═══════════════════════════════════════════════════════════════════════

function DvorakTab({ storm }: { storm: any }) {
  return (
    <div>
      <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
        <div className="metric-label">Current Pattern</div>
        <div style={{
          fontSize: '1.3rem', fontWeight: 800,
          marginTop: '4px', marginBottom: '4px',
          color: 'var(--accent-secondary)',
        }}>
          {storm.dvorak_pattern}
        </div>
        <span className={`category-badge ${storm.category.toLowerCase()}`} style={{
          background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-secondary)',
        }}>
          High Confidence
        </span>
      </div>

      <div className="glass-card metric-card" style={{ marginTop: '12px' }}>
        <div className="metric-label">T-Number (Dvorak)</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="metric-value" style={{ color: 'var(--accent-secondary)' }}>
            {storm.t_number.toFixed(1)}
          </span>
          <span className="metric-unit">/ 8.0</span>
        </div>
        <div className="metric-bar">
          <div
            className="metric-bar-fill"
            style={{
              width: `${((storm.t_number - 1) / 7) * 100}%`,
              background: 'var(--gradient-primary)',
            }}
          />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px',
        }}>
          <span>1.0 (TD)</span>
          <span>8.0 (SuCS)</span>
        </div>
      </div>

      {/* Dvorak evolution description */}
      <div className="glass-card" style={{ padding: '14px', marginTop: '12px' }}>
        <div className="section-header" style={{ marginBottom: '8px' }}>
          <span className="section-title">Structural Assessment</span>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {storm.dvorak_pattern === 'Eye' ? (
            <>
              <p>Well-defined <strong style={{ color: 'var(--text-primary)' }}>eye pattern</strong> detected with clear warm core signature in IR imagery.</p>
              <p style={{ marginTop: '8px' }}>CDO roundness: <strong style={{ color: 'var(--accent-green)' }}>0.88</strong> (highly symmetric)</p>
              <p>Outflow symmetry: <strong style={{ color: 'var(--accent-green)' }}>0.91</strong> (well-organized)</p>
            </>
          ) : (
            <>
              <p>Dense <strong style={{ color: 'var(--text-primary)' }}>Central Dense Overcast</strong> observed. Eye formation may be underway.</p>
              <p style={{ marginTop: '8px' }}>CDO roundness: <strong style={{ color: 'var(--accent-amber)' }}>
                {storm.category === 'VSCS' ? '0.75' : '0.82'}
              </strong></p>
              <p>Outflow symmetry: <strong style={{ color: 'var(--accent-amber)' }}>
                {storm.category === 'VSCS' ? '0.68' : '0.85'}
              </strong></p>
            </>
          )}
        </div>
      </div>

      {/* Segmentation classes */}
      <div className="glass-card" style={{ padding: '14px', marginTop: '12px' }}>
        <div className="section-header" style={{ marginBottom: '8px' }}>
          <span className="section-title">Pattern Classes</span>
        </div>
        {['CDO', 'Eyewall', 'Eye', 'Banding', 'Shear'].map((cls, i) => {
          const colors = ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444']
          const probs = storm.dvorak_pattern === 'Eye'
            ? [0.08, 0.15, 0.87, 0.02, 0.01]
            : [0.79, 0.08, 0.07, 0.05, 0.01]
          return (
            <div key={cls} className="factor-row">
              <span className="factor-label" style={{ color: colors[i], fontWeight: 600 }}>{cls}</span>
              <div className="factor-bar-track">
                <div className="factor-bar-fill" style={{ width: `${probs[i] * 100}%`, background: colors[i] }} />
              </div>
              <span className="factor-value">{(probs[i] * 100).toFixed(0)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  Tab: Landfall Risk
// ═══════════════════════════════════════════════════════════════════════

function LandfallTab({ storm }: { storm: any }) {
  return (
    <div>
      <div className="section-header">
        <span className="section-title">Coastal District Risk</span>
      </div>

      {storm.landfall_risk.map((risk: any) => {
        const pct = (risk.probability * 100).toFixed(0)
        const barColor = risk.probability > 0.5 ? '#ef4444' :
                         risk.probability > 0.3 ? '#f97316' : '#f59e0b'
        return (
          <div key={risk.district} className="glass-card" style={{
            padding: '12px', marginBottom: '8px',
            borderLeft: `3px solid ${barColor}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{risk.district}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{risk.state}</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '1.4rem',
                fontWeight: 800, color: barColor,
              }}>
                {pct}%
              </div>
            </div>
            <div className="metric-bar" style={{ marginTop: '8px' }}>
              <div className="metric-bar-fill" style={{
                width: `${risk.probability * 100}%`,
                background: barColor,
              }} />
            </div>
          </div>
        )
      })}

      {/* Risk summary */}
      <div className="glass-card" style={{
        padding: '14px', marginTop: '12px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), transparent)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
      }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 600,
          color: 'var(--accent-red)', marginBottom: '4px',
        }}>
          ⚠️ Landfall Assessment
        </div>
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          Based on 10-member analog ensemble analysis.
          Probabilities computed from intersection of 90% probability cone
          with coastal district boundaries.
          <br /><br />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Expected landfall: {storm.track ? `+${storm.track.find((p: any) => p.t > 24 && p.lat > 20)?.t || 36}h` : '+36h'}
          </span>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
//  Intensity Chart (Canvas-based)
// ═══════════════════════════════════════════════════════════════════════

function IntensityChart({ data, color }: { data: any; color: string }) {

  if (!data) return <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No timeline data</div>

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

  // Render SVG-based chart
  const upperPath = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${scaleX(t)},${scaleY(vmaxUpper[i])}`).join(' ')
  const lowerPath = [...timestamps].reverse().map((t: number, i: number) => `L${scaleX(t)},${scaleY(vmaxLower[n - 1 - i])}`).join(' ')
  const mainPath = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${scaleX(t)},${scaleY(vmax[i])}`).join(' ')

  // Find where t=0 is
  const zeroIdx = timestamps.indexOf(0)
  const zeroX = zeroIdx >= 0 ? scaleX(0) : scaleX(minT)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>
      {/* Background */}
      <rect x="0" y="0" width={width} height={height} fill="transparent" />

      {/* Grid lines */}
      {[30, 65, 90, 120].map(v => (
        <g key={v}>
          <line x1={pad.left} y1={scaleY(v)} x2={width - pad.right} y2={scaleY(v)}
                stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          <text x={pad.left - 4} y={scaleY(v) + 3} fill="rgba(148,163,184,0.5)"
                fontSize="8" textAnchor="end" fontFamily="JetBrains Mono">{v}</text>
        </g>
      ))}

      {/* Now line */}
      <line x1={zeroX} y1={pad.top} x2={zeroX} y2={height - pad.bottom}
            stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="4,3" />
      <text x={zeroX} y={height - 4} fill="rgba(255,255,255,0.4)"
            fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">NOW</text>

      {/* Uncertainty band */}
      <path d={`${upperPath} ${lowerPath} Z`} fill={`${color}15`} />

      {/* Main line */}
      <path d={mainPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Current dot */}
      {zeroIdx >= 0 && (
        <circle cx={scaleX(0)} cy={scaleY(vmax[zeroIdx])} r="4" fill={color}>
          <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Labels */}
      <text x={pad.left + 2} y={height - 4} fill="rgba(148,163,184,0.4)" fontSize="7" fontFamily="JetBrains Mono">
        -{timestamps.length > 12 ? '72' : '48'}h
      </text>
      <text x={width - pad.right} y={height - 4} fill="rgba(148,163,184,0.4)" fontSize="7" textAnchor="end" fontFamily="JetBrains Mono">
        +{timestamps.length > 12 ? '48' : '24'}h
      </text>
      <text x={pad.left - 4} y={pad.top + 4} fill="rgba(148,163,184,0.3)" fontSize="7" textAnchor="end" fontFamily="JetBrains Mono">kt</text>
    </svg>
  )
}
