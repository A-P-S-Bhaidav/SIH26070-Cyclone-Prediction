/**
 * AnalysisPanel — Right sidebar with Intensity, RI, Dvorak, Landfall tabs.
 * Professional light theme with clean data visualization.
 */
import { useState } from 'react'

const SEV_COLORS: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981',
  VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}

const TABS = [
  { id: 'intensity', label: 'Intensity' },
  { id: 'ri', label: 'RI' },
  { id: 'dvorak', label: 'Dvorak' },
  { id: 'landfall', label: 'Landfall' },
]

export default function AnalysisPanel({ storm }: { storm: any }) {
  const [tab, setTab] = useState('intensity')
  const color = SEV_COLORS[storm.category] || '#3b82f6'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="analysis-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`analysis-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="analysis-content" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'intensity' && <IntensityTab storm={storm} color={color} />}
        {tab === 'ri' && <RITab storm={storm} />}
        {tab === 'dvorak' && <DvorakTab storm={storm} />}
        {tab === 'landfall' && <LandfallTab storm={storm} />}
      </div>
    </div>
  )
}

/* ─── Intensity Tab ───────────────────────────────────── */
function IntensityTab({ storm, color }: { storm: any; color: string }) {
  const d = storm.intensity_data
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div className="metric-card">
          <div className="metric-label">Max Sustained Wind</div>
          <div className="metric-value" style={{ color }}>
            {d?.vmax?.mean || storm.vmax_kt}<span className="metric-unit">kt</span>
          </div>
          {d?.vmax && (
            <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {d.vmax.lower}–{d.vmax.upper} kt
            </div>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-label">Central Pressure</div>
          <div className="metric-value">
            {d?.mslp?.mean || storm.mslp_hpa}<span className="metric-unit">hPa</span>
          </div>
          {d?.mslp && (
            <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {d.mslp.lower}–{d.mslp.upper} hPa
            </div>
          )}
        </div>
      </div>

      {/* Category Distribution */}
      {d?.category_probs && (
        <div style={{ marginTop: '16px' }}>
          <div className="section-title">IMD Category Distribution</div>
          {Object.entries(d.category_probs as Record<string, number>)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([cat, prob]) => (
              <div className="prob-bar-row" key={cat}>
                <span className="prob-bar-label" style={{ color: SEV_COLORS[cat] || '#64748b' }}>{cat}</span>
                <div className="prob-bar-track">
                  <div className="prob-bar-fill" style={{ width: `${(prob as number) * 100}%`, background: SEV_COLORS[cat] || '#94a3b8' }} />
                </div>
                <span className="prob-bar-val">{((prob as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
        </div>
      )}

      {/* Intensity Timeline Chart */}
      {storm.timeline && <IntensityChart data={storm.timeline} color={color} />}
    </div>
  )
}

/* ─── RI Tab ──────────────────────────────────────────── */
function RITab({ storm }: { storm: any }) {
  const ri = storm.ri_data
  const prob = ri?.probability?.mean || storm.ri_probability || 0
  const alertColor = prob > 0.7 ? '#ef4444' : prob > 0.5 ? '#f97316' : prob > 0.3 ? '#f59e0b' : '#10b981'
  const alertLabel = prob > 0.7 ? 'HIGH' : prob > 0.5 ? 'ELEVATED' : prob > 0.3 ? 'MODERATE' : 'LOW'
  const alertBg = prob > 0.7 ? '#fee2e2' : prob > 0.5 ? '#fff7ed' : prob > 0.3 ? '#fef3c7' : '#d1fae5'

  const circumference = 2 * Math.PI * 52
  const offset = circumference * (1 - prob)

  return (
    <div>
      <div className="alert-banner" style={{ background: alertBg, color: alertColor }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        {alertLabel} — Rapid Intensification Alert
      </div>

      <div className="gauge-wrap">
        <svg width="130" height="130" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke={alertColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div className="gauge-pct" style={{ color: alertColor }}>{(prob * 100).toFixed(0)}%</div>
          <div className="gauge-sub">RI in 24h</div>
        </div>
      </div>

      {/* Contributing Factors */}
      {ri?.factors && (
        <div style={{ marginTop: '8px' }}>
          <div className="section-title">Contributing Factors</div>
          {Object.entries(ri.factors as Record<string, number>).map(([name, val]) => {
            const fColor = (val as number) > 0.7 ? '#10b981' : (val as number) > 0.4 ? '#f59e0b' : '#ef4444'
            return (
              <div className="factor-row" key={name}>
                <span className="factor-label">{name}</span>
                <div className="factor-track">
                  <div className="factor-fill" style={{ width: `${(val as number) * 100}%`, background: fColor }} />
                </div>
                <span className="factor-val">{((val as number) * 100).toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Dvorak Tab ──────────────────────────────────────── */
function DvorakTab({ storm }: { storm: any }) {
  const tNum = storm.t_number || 4.0
  const pattern = storm.dvorak_pattern || 'CDO'
  const patterns = ['CDO', 'Eyewall', 'Eye', 'Banding', 'Shear']
  const patColors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
  const probs = pattern === 'Eye'
    ? [0.08, 0.15, 0.87, 0.02, 0.01]
    : [0.79, 0.08, 0.07, 0.05, 0.01]

  return (
    <div>
      <div className="metric-card">
        <div className="metric-label">Dvorak T-Number</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span className="metric-value" style={{ color: '#2563eb' }}>{tNum.toFixed(1)}</span>
          <span className="metric-unit">/ 8.0</span>
        </div>
        <div style={{ marginTop: '10px' }}>
          <div className="prob-bar-track" style={{ height: '8px' }}>
            <div className="prob-bar-fill" style={{
              width: `${((tNum - 1) / 7) * 100}%`,
              background: 'linear-gradient(90deg, #60a5fa, #2563eb)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#94a3b8', marginTop: '6px' }}>
            <span>1.0 (TD)</span><span>8.0 (SuCS)</span>
          </div>
        </div>
      </div>

      <div className="metric-card" style={{ marginTop: '12px' }}>
        <div className="metric-label">Current Pattern: {pattern}</div>
        <div style={{ marginTop: '10px' }}>
          {patterns.map((cls, i) => (
            <div className="prob-bar-row" key={cls}>
              <span className="prob-bar-label" style={{ color: patColors[i] }}>{cls}</span>
              <div className="prob-bar-track">
                <div className="prob-bar-fill" style={{ width: `${probs[i] * 100}%`, background: patColors[i] }} />
              </div>
              <span className="prob-bar-val">{(probs[i] * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Landfall Tab ────────────────────────────────────── */
function LandfallTab({ storm }: { storm: any }) {
  const risks = [...(storm?.landfall_risk || [])].sort((a: any, b: any) => b.probability - a.probability)
  if (!risks.length) return <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No landfall risks assessed.</div>

  return (
    <div>
      <div className="alert-banner" style={{ background: '#fee2e2', color: '#ef4444' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Coastal Landfall Assessment
      </div>

      {risks.map((risk: any) => {
        const prob = risk.probability
        const barColor = prob > 0.5 ? '#ef4444' : prob > 0.3 ? '#f59e0b' : '#10b981'
        return (
          <div className="risk-item" key={risk.district} style={{ borderLeft: `3px solid ${barColor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="risk-district">{risk.district}</div>
                <div className="risk-state">{risk.state}</div>
              </div>
              <div className="risk-pct" style={{ color: barColor }}>{(prob * 100).toFixed(0)}%</div>
            </div>
            <div className="prob-bar-track" style={{ marginTop: '8px' }}>
              <div className="prob-bar-fill" style={{ width: `${prob * 100}%`, background: barColor }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Intensity Chart (SVG) ───────────────────────────── */
function IntensityChart({ data, color }: { data: any; color: string }) {
  if (!data?.timestamps) return null
  const { timestamps, vmax, vmaxUpper, vmaxLower } = data
  const n = timestamps.length
  const w = 300, h = 130
  const pad = { t: 10, r: 10, b: 24, l: 34 }

  const minV = Math.min(...vmaxLower) - 5, maxV = Math.max(...vmaxUpper) + 5
  const minT = timestamps[0], maxT = timestamps[n - 1]
  const sx = (t: number) => pad.l + ((t - minT) / (maxT - minT)) * (w - pad.l - pad.r)
  const sy = (v: number) => pad.t + ((maxV - v) / (maxV - minV)) * (h - pad.t - pad.b)

  const upper = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${sx(t)},${sy(vmaxUpper[i])}`).join(' ')
  const lower = [...timestamps].reverse().map((t: number, i: number) => `L${sx(t)},${sy(vmaxLower[n - 1 - i])}`).join(' ')
  const main = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${sx(t)},${sy(vmax[i])}`).join(' ')
  const zeroX = timestamps.indexOf(0) >= 0 ? sx(0) : sx(minT)
  const zi = timestamps.indexOf(0)

  return (
    <div style={{ marginTop: '16px' }}>
      <div className="section-title">Intensity Forecast</div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
        {[40, 70, 100, 130].map(v => (
          <g key={v}>
            <line x1={pad.l} y1={sy(v)} x2={w - pad.r} y2={sy(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.l - 5} y={sy(v) + 3} fill="#94a3b8" fontSize="8" textAnchor="end">{v}</text>
          </g>
        ))}
        <line x1={zeroX} y1={pad.t} x2={zeroX} y2={h - pad.b} stroke="#3b82f6" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        <text x={zeroX} y={h - 6} fill="#3b82f6" fontSize="8" textAnchor="middle" fontWeight="700">NOW</text>
        <path d={`${upper} ${lower} Z`} fill={`${color}15`} />
        <path d={main} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {zi >= 0 && (
          <circle cx={sx(0)} cy={sy(vmax[zi])} r="4" fill={color}>
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
        <text x={pad.l} y={h - 6} fill="#94a3b8" fontSize="7">Past</text>
        <text x={w - pad.r} y={h - 6} fill="#94a3b8" fontSize="7" textAnchor="end">Forecast</text>
        <text x={pad.l - 5} y={pad.t + 4} fill="#94a3b8" fontSize="7" textAnchor="end">kt</text>
      </svg>
    </div>
  )
}
