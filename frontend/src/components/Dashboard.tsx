/**
 * Dashboard — Map fills background. Panels float as overlay cards.
 * Layout: Storms (top-left) | Map (full) | Analysis (top-right) | Genesis (bottom-left)
 */
import { useState, useEffect, useRef } from 'react'
import Header from './Header'
import StormList from './StormList'
import MapView from './MapView'
import AnalysisPanel from './AnalysisPanel'

const DEMO = [
  {
    storm_id: 'AMPHAN_2020', storm_name: 'Amphan',
    position: { lat: 15.2, lon: 87.1 }, vmax_kt: 130, mslp_hpa: 920,
    category: 'ESCS', ri_probability: 0.82, t_number: 6.5, dvorak_pattern: 'Eye',
    track: [
      { lat: 13.0, lon: 87.5, t: -24, vmax: 80 }, { lat: 13.8, lon: 87.4, t: -18, vmax: 95 },
      { lat: 14.5, lon: 87.2, t: -12, vmax: 110 }, { lat: 15.2, lon: 87.1, t: 0, vmax: 130 },
      { lat: 15.9, lon: 87.0, t: 6, vmax: 135 }, { lat: 16.8, lon: 86.8, t: 12, vmax: 130 },
      { lat: 18.5, lon: 86.3, t: 24, vmax: 115 }, { lat: 20.2, lon: 87.0, t: 36, vmax: 90 },
      { lat: 21.8, lon: 88.2, t: 48, vmax: 65 },
    ],
    intensity_data: {
      vmax: { mean: 130, std: 8, lower: 114, upper: 146 },
      mslp: { mean: 920, std: 5, lower: 910, upper: 930 },
      category_probs: { TD: 0, CS: 0, SCS: 0.02, VSCS: 0.06, ESCS: 0.92, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.82, std: 0.09 },
      factors: { 'Ocean Heat': 0.95, 'Wind Shear': 0.15, 'CDO Roundness': 0.88, 'Outflow Sym.': 0.91, 'SST Anomaly': 0.78 },
    },
    landfall_risk: [
      { district: 'South 24 Parganas', state: 'West Bengal', probability: 0.72 },
      { district: 'North 24 Parganas', state: 'West Bengal', probability: 0.58 },
      { district: 'Kolkata', state: 'West Bengal', probability: 0.45 },
      { district: 'Balasore', state: 'Odisha', probability: 0.32 },
    ],
    timeline: mkTimeline(130, 12, 8),
  },
  {
    storm_id: 'FANI_2019', storm_name: 'Fani',
    position: { lat: 14.8, lon: 85.9 }, vmax_kt: 115, mslp_hpa: 934,
    category: 'ESCS', ri_probability: 0.65, t_number: 5.5, dvorak_pattern: 'CDO',
    track: [
      { lat: 12.5, lon: 86.5, t: -24, vmax: 65 }, { lat: 13.2, lon: 86.3, t: -18, vmax: 80 },
      { lat: 14.0, lon: 86.1, t: -12, vmax: 95 }, { lat: 14.8, lon: 85.9, t: 0, vmax: 115 },
      { lat: 15.5, lon: 85.6, t: 6, vmax: 120 }, { lat: 16.3, lon: 85.2, t: 12, vmax: 115 },
      { lat: 18.0, lon: 84.5, t: 24, vmax: 95 }, { lat: 19.5, lon: 84.8, t: 36, vmax: 70 },
      { lat: 20.8, lon: 85.5, t: 48, vmax: 45 },
    ],
    intensity_data: {
      vmax: { mean: 115, std: 7, lower: 101, upper: 129 },
      mslp: { mean: 934, std: 4, lower: 926, upper: 942 },
      category_probs: { TD: 0, CS: 0, SCS: 0.03, VSCS: 0.09, ESCS: 0.88, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.65, std: 0.12 },
      factors: { 'Ocean Heat': 0.88, 'Wind Shear': 0.22, 'CDO Roundness': 0.82, 'Outflow Sym.': 0.85, 'SST Anomaly': 0.72 },
    },
    landfall_risk: [
      { district: 'Puri', state: 'Odisha', probability: 0.68 },
      { district: 'Ganjam', state: 'Odisha', probability: 0.52 },
      { district: 'Srikakulam', state: 'Andhra Pradesh', probability: 0.35 },
    ],
    timeline: mkTimeline(115, 12, 8),
  },
  {
    storm_id: 'TAUKTAE_2021', storm_name: 'Tauktae',
    position: { lat: 16.5, lon: 72.8 }, vmax_kt: 95, mslp_hpa: 950,
    category: 'VSCS', ri_probability: 0.45, t_number: 4.5, dvorak_pattern: 'CDO',
    track: [
      { lat: 14.0, lon: 73.5, t: -24, vmax: 45 }, { lat: 14.8, lon: 73.3, t: -18, vmax: 60 },
      { lat: 15.5, lon: 73.1, t: -12, vmax: 75 }, { lat: 16.5, lon: 72.8, t: 0, vmax: 95 },
      { lat: 17.2, lon: 72.3, t: 6, vmax: 100 }, { lat: 18.0, lon: 71.8, t: 12, vmax: 95 },
      { lat: 19.5, lon: 71.0, t: 24, vmax: 80 }, { lat: 20.5, lon: 70.5, t: 36, vmax: 60 },
      { lat: 21.3, lon: 70.2, t: 48, vmax: 40 },
    ],
    intensity_data: {
      vmax: { mean: 95, std: 6, lower: 83, upper: 107 },
      mslp: { mean: 950, std: 3, lower: 944, upper: 956 },
      category_probs: { TD: 0, CS: 0.01, SCS: 0.08, VSCS: 0.85, ESCS: 0.06, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.45, std: 0.15 },
      factors: { 'Ocean Heat': 0.72, 'Wind Shear': 0.35, 'CDO Roundness': 0.75, 'Outflow Sym.': 0.68, 'SST Anomaly': 0.65 },
    },
    landfall_risk: [
      { district: 'Junagadh', state: 'Gujarat', probability: 0.62 },
      { district: 'Porbandar', state: 'Gujarat', probability: 0.48 },
      { district: 'Mumbai', state: 'Maharashtra', probability: 0.22 },
    ],
    timeline: mkTimeline(95, 12, 8),
  },
]

function mkTimeline(base: number, nP: number, nF: number) {
  const ts: number[] = [], vmax: number[] = [], mslp: number[] = [], u: number[] = [], l: number[] = []
  for (let i = -nP; i <= nF; i++) {
    const h = i * 6, ph = i / nP
    const v = base * (0.4 + 0.6 * Math.exp(-0.5 * ((ph - 0.5) ** 2) / 0.3))
    const unc = Math.max(0, i) * 2 + 3
    ts.push(h); vmax.push(+(v).toFixed(1)); mslp.push(+(1010 - (v / 6.3) ** 2).toFixed(1))
    u.push(+(v + unc).toFixed(1)); l.push(+Math.max(15, v - unc).toFixed(1))
  }
  return { timestamps: ts, vmax, mslp, vmaxUpper: u, vmaxLower: l }
}

const GENESIS_ZONES = [
  { id: 'bob', region: 'Bay of Bengal', lead: '+48h', lat: 11.5, lon: 85.0, prob: 42, desc: 'Low-pressure area showing increasing convective organization over warm SST (29.5°C). Upper divergence favorable.' },
  { id: 'as', region: 'Arabian Sea', lead: '+72h', lat: 14.2, lon: 68.5, prob: 28, desc: 'Weak circulation near Lakshadweep. Moderate VWS inhibiting development. SST 28.8°C supports surface fluxes.' },
  { id: 'bob2', region: 'South BoB', lead: '+96h', lat: 8.0, lon: 88.0, prob: 18, desc: 'Equatorial disturbance with enhanced vorticity at 850hPa. MJO Phase 4 may support development after day 4.' },
]

function GenesisPanel() {
  const [activeIdx, setActiveIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollTo = (idx: number) => {
    setActiveIdx(idx)
    scrollRef.current?.children[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  const handleScroll = () => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIdx(idx)
  }

  return (
    <div className="float-panel panel-genesis">
      <div style={{ padding: '10px 14px 6px', fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        Genesis Watch
      </div>
      <div className="genesis-scroll" ref={scrollRef} onScroll={handleScroll}>
        {GENESIS_ZONES.map(g => (
          <div key={g.id} className="genesis-item">
            <div className="genesis-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {g.region} · {g.lead}
            </div>
            <div className="genesis-text">
              {g.lat.toFixed(1)}°N, {g.lon.toFixed(1)}°E — <span className="genesis-prob">{g.prob}%</span> probability
            </div>
            <div className="genesis-text" style={{ marginTop: '4px', fontSize: '.62rem' }}>{g.desc}</div>
          </div>
        ))}
      </div>
      <div className="genesis-nav">
        {GENESIS_ZONES.map((g, i) => (
          <button key={g.id} className={`genesis-dot ${i === activeIdx ? 'active' : ''}`} onClick={() => scrollTo(i)} />
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [cyclones] = useState(DEMO)
  const [selected, setSelected] = useState(DEMO[0].storm_id)
  const [isLive] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('vn-theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vn-theme', theme)
  }, [theme])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2400)
    return () => clearTimeout(t)
  }, [])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  const active = cyclones.find(c => c.storm_id === selected) || cyclones[0]

  return (
    <>
      {/* Loading Screen */}
      <div className={`loading-screen ${loading ? '' : 'fade-out'}`}>
        <img src="/favicon.jpg" alt="Vayu Netra" className="loading-logo" style={{ borderRadius: '14px' }} />
        <div className="loading-title">Vayu Netra</div>
        <div className="loading-sub">NIO Cyclone Prediction System</div>
        <div className="loading-spinner" />
        <div className="loading-bar-track"><div className="loading-bar-fill" /></div>
      </div>

      <Header isLive={isLive} stormCount={cyclones.length} theme={theme} onToggleTheme={toggleTheme} />

      <div className="dashboard-body">
        {/* Full-screen Map */}
        <div className="map-layer">
          <MapView storm={active} />
        </div>

        {/* Top-Left: Tracked Storms */}
        <div className="float-panel panel-storms">
          <div className="panel-section-title">Tracked Storms</div>
          <div className="storm-list">
            <StormList cyclones={cyclones} selectedId={selected} onSelect={setSelected} />
          </div>
        </div>

        {/* Top-Right: Analysis */}
        <div className="float-panel panel-analysis">
          <AnalysisPanel storm={active} />
        </div>

        {/* Bottom-Left: Genesis Watch — horizontal swipe */}
        <GenesisPanel />
      </div>
    </>
  )
}
