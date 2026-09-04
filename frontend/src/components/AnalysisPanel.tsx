/**
 * AnalysisPanel — Compact analysis with fixed RI gauge.
 */
import { useState } from 'react'

const SEV: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981', VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}
const TABS = [{ id: 'intensity', l: 'Intensity' }, { id: 'ri', l: 'RI' }, { id: 'dvorak', l: 'Dvorak' }, { id: 'landfall', l: 'Landfall' }]

export default function AnalysisPanel({ storm }: { storm: any }) {
  const [tab, setTab] = useState('intensity')
  const color = SEV[storm.category] || '#3b82f6'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="analysis-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`analysis-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.l}</button>
        ))}
      </div>
      <div className="analysis-content">
        {tab === 'intensity' && <IntensityTab storm={storm} color={color} />}
        {tab === 'ri' && <RITab storm={storm} />}
        {tab === 'dvorak' && <DvorakTab storm={storm} />}
        {tab === 'landfall' && <LandfallTab storm={storm} />}
      </div>
    </div>
  )
}

function IntensityTab({ storm, color }: { storm: any; color: string }) {
  const d = storm.intensity_data
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <div className="metric-card">
          <div className="metric-label">Vmax</div>
          <div className="metric-value" style={{ color }}>{d?.vmax?.mean || storm.vmax_kt}<span className="metric-unit">kt</span></div>
          {d?.vmax && <div className="metric-range">{d.vmax.lower}–{d.vmax.upper}</div>}
        </div>
        <div className="metric-card">
          <div className="metric-label">MSLP</div>
          <div className="metric-value">{d?.mslp?.mean || storm.mslp_hpa}<span className="metric-unit">hPa</span></div>
          {d?.mslp && <div className="metric-range">{d.mslp.lower}–{d.mslp.upper}</div>}
        </div>
      </div>
      {d?.category_probs && (
        <div style={{ marginTop: '8px' }}>
          <div className="section-title">Category Distribution</div>
          {Object.entries(d.category_probs as Record<string, number>)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([cat, prob]) => (
              <div className="prob-bar-row" key={cat}>
                <span className="prob-bar-label" style={{ color: SEV[cat] }}>{cat}</span>
                <div className="prob-bar-track">
                  <div className="prob-bar-fill" style={{ width: `${(prob as number) * 100}%`, background: SEV[cat] }} />
                </div>
                <span className="prob-bar-val">{((prob as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
        </div>
      )}
      {storm.timeline && <TimelineChart data={storm.timeline} color={color} />}
    </div>
  )
}

function RITab({ storm }: { storm: any }) {
  const ri = storm.ri_data
  const prob = ri?.probability?.mean || storm.ri_probability || 0
  const ac = prob > 0.7 ? '#ef4444' : prob > 0.5 ? '#f97316' : prob > 0.3 ? '#f59e0b' : '#10b981'
  const al = prob > 0.7 ? 'HIGH' : prob > 0.5 ? 'ELEVATED' : prob > 0.3 ? 'MODERATE' : 'LOW'
  const ab = prob > 0.7 ? 'var(--red-100)' : prob > 0.5 ? 'var(--amber-100)' : prob > 0.3 ? 'var(--amber-100)' : 'var(--green-100)'
  const C = 2 * Math.PI * 44
  const off = C * (1 - prob)

  return (
    <div>
      <div className="alert-banner" style={{ background: ab, color: ac }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        {al} — RI Alert
      </div>
      <div className="gauge-wrap" style={{ height: '120px' }}>
        <svg width="110" height="110" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--bg-hover)" strokeWidth="7" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={ac} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset .8s ease' }} />
        </svg>
        <div className="gauge-center">
          <div className="gauge-pct" style={{ color: ac }}>{(prob * 100).toFixed(0)}%</div>
          <div className="gauge-sub">RI in 24h</div>
        </div>
      </div>
      {ri?.factors && (
        <div>
          <div className="section-title">Factors</div>
          {Object.entries(ri.factors as Record<string, number>).map(([n, v]) => {
            const fc = (v as number) > 0.7 ? '#10b981' : (v as number) > 0.4 ? '#f59e0b' : '#ef4444'
            return (
              <div className="factor-row" key={n}>
                <span className="factor-label">{n}</span>
                <div className="factor-track"><div className="factor-fill" style={{ width: `${(v as number) * 100}%`, background: fc }} /></div>
                <span className="factor-val">{((v as number) * 100).toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DvorakTab({ storm }: { storm: any }) {
  const tNum = storm.t_number || 4.0
  const pat = storm.dvorak_pattern || 'CDO'
  const pats = ['CDO', 'Eyewall', 'Eye', 'Banding', 'Shear']
  const pc = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
  const pr = pat === 'Eye' ? [0.08, 0.15, 0.87, 0.02, 0.01] : [0.79, 0.08, 0.07, 0.05, 0.01]
  return (
    <div>
      <div className="metric-card">
        <div className="metric-label">T-Number</div>
        <div className="metric-value" style={{ color: '#2563eb' }}>{tNum.toFixed(1)}<span className="metric-unit">/ 8.0</span></div>
        <div className="prob-bar-track" style={{ height: '6px', marginTop: '6px' }}>
          <div className="prob-bar-fill" style={{ width: `${((tNum - 1) / 7) * 100}%`, background: 'linear-gradient(90deg,#60a5fa,#2563eb)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.55rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          <span>1.0 (TD)</span><span>8.0 (SuCS)</span>
        </div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Pattern: {pat}</div>
        <div style={{ marginTop: '6px' }}>
          {pats.map((cls, i) => (
            <div className="prob-bar-row" key={cls}>
              <span className="prob-bar-label" style={{ color: pc[i] }}>{cls}</span>
              <div className="prob-bar-track"><div className="prob-bar-fill" style={{ width: `${pr[i] * 100}%`, background: pc[i] }} /></div>
              <span className="prob-bar-val">{(pr[i] * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LandfallTab({ storm }: { storm: any }) {
  const risks = [...(storm?.landfall_risk || [])].sort((a: any, b: any) => b.probability - a.probability)
  if (!risks.length) return <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>No landfall risks.</div>
  return (
    <div>
      <div className="alert-banner" style={{ background: 'var(--red-100)', color: 'var(--red-500)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Coastal Landfall Assessment
      </div>
      {risks.map((r: any) => {
        const bc = r.probability > 0.5 ? '#ef4444' : r.probability > 0.3 ? '#f59e0b' : '#10b981'
        return (
          <div className="risk-item" key={r.district} style={{ borderLeft: `3px solid ${bc}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div className="risk-district">{r.district}</div><div className="risk-state">{r.state}</div></div>
              <div className="risk-pct" style={{ color: bc }}>{(r.probability * 100).toFixed(0)}%</div>
            </div>
            <div className="prob-bar-track" style={{ marginTop: '6px' }}>
              <div className="prob-bar-fill" style={{ width: `${r.probability * 100}%`, background: bc }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TimelineChart({ data, color }: { data: any; color: string }) {
  if (!data?.timestamps) return null
  const { timestamps, vmax, vmaxUpper, vmaxLower } = data
  const n = timestamps.length
  const w = 260, h = 110
  const p = { t: 8, r: 8, b: 20, l: 30 }
  const minV = Math.min(...vmaxLower) - 5, maxV = Math.max(...vmaxUpper) + 5
  const minT = timestamps[0], maxT = timestamps[n - 1]
  const sx = (t: number) => p.l + ((t - minT) / (maxT - minT)) * (w - p.l - p.r)
  const sy = (v: number) => p.t + ((maxV - v) / (maxV - minV)) * (h - p.t - p.b)
  const up = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${sx(t)},${sy(vmaxUpper[i])}`).join(' ')
  const lo = [...timestamps].reverse().map((t: number, i: number) => `L${sx(t)},${sy(vmaxLower[n - 1 - i])}`).join(' ')
  const main = timestamps.map((t: number, i: number) => `${i === 0 ? 'M' : 'L'}${sx(t)},${sy(vmax[i])}`).join(' ')
  const zi = timestamps.indexOf(0)
  const zx = zi >= 0 ? sx(0) : sx(minT)
  return (
    <div style={{ marginTop: '8px' }}>
      <div className="section-title">Intensity Forecast</div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
        {[40, 70, 100, 130].map(v => (
          <g key={v}><line x1={p.l} y1={sy(v)} x2={w - p.r} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={p.l - 4} y={sy(v) + 3} fill="var(--text-muted)" fontSize="7" textAnchor="end">{v}</text></g>
        ))}
        <line x1={zx} y1={p.t} x2={zx} y2={h - p.b} stroke="var(--blue-500)" strokeWidth="1" strokeDasharray="3,3" opacity=".4" />
        <text x={zx} y={h - 4} fill="var(--blue-500)" fontSize="7" textAnchor="middle" fontWeight="700">NOW</text>
        <path d={`${up} ${lo} Z`} fill={`${color}15`} />
        <path d={main} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        {zi >= 0 && <circle cx={sx(0)} cy={sy(vmax[zi])} r="3" fill={color}>
          <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
        </circle>}
      </svg>
    </div>
  )
}
