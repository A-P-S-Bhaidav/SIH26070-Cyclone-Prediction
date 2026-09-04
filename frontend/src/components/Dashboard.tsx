/**
 * CycloneAI Dashboard — Main Layout Component
 * 
 * Three-panel layout: Storm List | Map | Analysis Panels
 * Fully functional with demo data when backend is unavailable.
 */

import { useState } from 'react'
import Header from './Header'
import StormList from './StormList'
import MapView from './MapView'
import AnalysisPanel from './AnalysisPanel'

// Demo data for offline/demo operation
const DEMO_CYCLONES = [
  {
    storm_id: 'AMPHAN_2020',
    storm_name: 'Amphan',
    position: { lat: 15.2, lon: 87.1 },
    vmax_kt: 130,
    mslp_hpa: 920,
    category: 'ESCS',
    category_full: 'Extremely Severe Cyclonic Storm',
    is_active: true,
    ri_probability: 0.82,
    alert_level: 'HIGH',
    t_number: 6.5,
    dvorak_pattern: 'Eye',
    track: [
      { lat: 13.0, lon: 87.5, t: -24, vmax: 80 },
      { lat: 13.8, lon: 87.4, t: -18, vmax: 95 },
      { lat: 14.5, lon: 87.2, t: -12, vmax: 110 },
      { lat: 15.2, lon: 87.1, t: 0, vmax: 130 },
      { lat: 15.9, lon: 87.0, t: 6, vmax: 135 },
      { lat: 16.8, lon: 86.8, t: 12, vmax: 130 },
      { lat: 18.5, lon: 86.3, t: 24, vmax: 115 },
      { lat: 20.2, lon: 87.0, t: 36, vmax: 90 },
      { lat: 21.8, lon: 88.2, t: 48, vmax: 65 },
    ],
    cone_50: generateCone(
      [{ lat: 15.9, lon: 87.0 }, { lat: 16.8, lon: 86.8 }, { lat: 18.5, lon: 86.3 }, { lat: 20.2, lon: 87.0 }, { lat: 21.8, lon: 88.2 }],
      0.3
    ),
    cone_90: generateCone(
      [{ lat: 15.9, lon: 87.0 }, { lat: 16.8, lon: 86.8 }, { lat: 18.5, lon: 86.3 }, { lat: 20.2, lon: 87.0 }, { lat: 21.8, lon: 88.2 }],
      0.8
    ),
    intensity_data: {
      vmax: { mean: 130, std: 8, lower: 114, upper: 146 },
      mslp: { mean: 920, std: 5, lower: 910, upper: 930 },
      category_probs: { TD: 0, CS: 0, SCS: 0.02, VSCS: 0.06, ESCS: 0.92, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.82, std: 0.09 },
      factors: {
        'Ocean Heat': 0.95,
        'Wind Shear': 0.15,
        'CDO Roundness': 0.88,
        'Outflow Sym.': 0.91,
        'SST Anomaly': 0.78,
      },
    },
    landfall_risk: [
      { district: 'South 24 Parganas', state: 'West Bengal', probability: 0.72 },
      { district: 'North 24 Parganas', state: 'West Bengal', probability: 0.58 },
      { district: 'Kolkata', state: 'West Bengal', probability: 0.45 },
      { district: 'Balasore', state: 'Odisha', probability: 0.32 },
    ],
    timeline: generateTimeline(130, 920, 12, 8),
  },
  {
    storm_id: 'FANI_2019',
    storm_name: 'Fani',
    position: { lat: 14.8, lon: 85.9 },
    vmax_kt: 115,
    mslp_hpa: 934,
    category: 'ESCS',
    category_full: 'Extremely Severe Cyclonic Storm',
    is_active: true,
    ri_probability: 0.65,
    alert_level: 'ELEVATED',
    t_number: 5.5,
    dvorak_pattern: 'CDO',
    track: [
      { lat: 12.5, lon: 86.5, t: -24, vmax: 65 },
      { lat: 13.2, lon: 86.3, t: -18, vmax: 80 },
      { lat: 14.0, lon: 86.1, t: -12, vmax: 95 },
      { lat: 14.8, lon: 85.9, t: 0, vmax: 115 },
      { lat: 15.5, lon: 85.6, t: 6, vmax: 120 },
      { lat: 16.3, lon: 85.2, t: 12, vmax: 115 },
      { lat: 18.0, lon: 84.5, t: 24, vmax: 95 },
      { lat: 19.5, lon: 84.8, t: 36, vmax: 70 },
      { lat: 20.8, lon: 85.5, t: 48, vmax: 45 },
    ],
    cone_50: generateCone(
      [{ lat: 15.5, lon: 85.6 }, { lat: 16.3, lon: 85.2 }, { lat: 18.0, lon: 84.5 }, { lat: 19.5, lon: 84.8 }, { lat: 20.8, lon: 85.5 }],
      0.3
    ),
    cone_90: generateCone(
      [{ lat: 15.5, lon: 85.6 }, { lat: 16.3, lon: 85.2 }, { lat: 18.0, lon: 84.5 }, { lat: 19.5, lon: 84.8 }, { lat: 20.8, lon: 85.5 }],
      0.8
    ),
    intensity_data: {
      vmax: { mean: 115, std: 7, lower: 101, upper: 129 },
      mslp: { mean: 934, std: 4, lower: 926, upper: 942 },
      category_probs: { TD: 0, CS: 0, SCS: 0.03, VSCS: 0.09, ESCS: 0.88, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.65, std: 0.12 },
      factors: {
        'Ocean Heat': 0.88,
        'Wind Shear': 0.22,
        'CDO Roundness': 0.82,
        'Outflow Sym.': 0.85,
        'SST Anomaly': 0.72,
      },
    },
    landfall_risk: [
      { district: 'Puri', state: 'Odisha', probability: 0.68 },
      { district: 'Ganjam', state: 'Odisha', probability: 0.52 },
      { district: 'Srikakulam', state: 'Andhra Pradesh', probability: 0.35 },
    ],
    timeline: generateTimeline(115, 934, 12, 8),
  },
  {
    storm_id: 'TAUKTAE_2021',
    storm_name: 'Tauktae',
    position: { lat: 16.5, lon: 72.8 },
    vmax_kt: 95,
    mslp_hpa: 950,
    category: 'VSCS',
    category_full: 'Very Severe Cyclonic Storm',
    is_active: true,
    ri_probability: 0.45,
    alert_level: 'MODERATE',
    t_number: 4.5,
    dvorak_pattern: 'CDO',
    track: [
      { lat: 14.0, lon: 73.5, t: -24, vmax: 45 },
      { lat: 14.8, lon: 73.3, t: -18, vmax: 60 },
      { lat: 15.5, lon: 73.1, t: -12, vmax: 75 },
      { lat: 16.5, lon: 72.8, t: 0, vmax: 95 },
      { lat: 17.2, lon: 72.3, t: 6, vmax: 100 },
      { lat: 18.0, lon: 71.8, t: 12, vmax: 95 },
      { lat: 19.5, lon: 71.0, t: 24, vmax: 80 },
      { lat: 20.5, lon: 70.5, t: 36, vmax: 60 },
      { lat: 21.3, lon: 70.2, t: 48, vmax: 40 },
    ],
    cone_50: generateCone(
      [{ lat: 17.2, lon: 72.3 }, { lat: 18.0, lon: 71.8 }, { lat: 19.5, lon: 71.0 }, { lat: 20.5, lon: 70.5 }, { lat: 21.3, lon: 70.2 }],
      0.3
    ),
    cone_90: generateCone(
      [{ lat: 17.2, lon: 72.3 }, { lat: 18.0, lon: 71.8 }, { lat: 19.5, lon: 71.0 }, { lat: 20.5, lon: 70.5 }, { lat: 21.3, lon: 70.2 }],
      0.8
    ),
    intensity_data: {
      vmax: { mean: 95, std: 6, lower: 83, upper: 107 },
      mslp: { mean: 950, std: 3, lower: 944, upper: 956 },
      category_probs: { TD: 0, CS: 0.01, SCS: 0.08, VSCS: 0.85, ESCS: 0.06, SuCS: 0 },
    },
    ri_data: {
      probability: { mean: 0.45, std: 0.15 },
      factors: {
        'Ocean Heat': 0.72,
        'Wind Shear': 0.35,
        'CDO Roundness': 0.75,
        'Outflow Sym.': 0.68,
        'SST Anomaly': 0.65,
      },
    },
    landfall_risk: [
      { district: 'Junagadh', state: 'Gujarat', probability: 0.62 },
      { district: 'Porbandar', state: 'Gujarat', probability: 0.48 },
      { district: 'Mumbai', state: 'Maharashtra', probability: 0.22 },
    ],
    timeline: generateTimeline(95, 950, 12, 8),
  },
]

function generateCone(points: {lat: number, lon: number}[], radius: number) {
  return points.map(p => {
    const coords: [number, number][] = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      coords.push([
        p.lon + radius * Math.cos(a) * 1.2,
        p.lat + radius * Math.sin(a),
      ])
    }
    coords.push(coords[0])
    return coords
  })
}

function generateTimeline(baseVmax: number, _baseMslp: number, nPast: number, nFuture: number) {
  const ts: number[] = []
  const vmax: number[] = []
  const mslp: number[] = []
  const vmaxUpper: number[] = []
  const vmaxLower: number[] = []

  for (let i = -nPast; i <= nFuture; i++) {
    const hours = i * 6
    const phase = i / nPast
    const v = baseVmax * (0.4 + 0.6 * Math.exp(-0.5 * Math.pow(phase - 0.5, 2) / 0.3))
    const m = 1010 - Math.pow(v / 6.3, 2)
    const unc = Math.max(0, i) * 2 + 3

    ts.push(hours)
    vmax.push(Math.round(v * 10) / 10)
    mslp.push(Math.round(m * 10) / 10)
    vmaxUpper.push(Math.round((v + unc) * 10) / 10)
    vmaxLower.push(Math.round(Math.max(15, v - unc) * 10) / 10)
  }
  return { timestamps: ts, vmax, mslp, vmaxUpper, vmaxLower }
}

export default function Dashboard() {
  const [cyclones] = useState<any[]>(DEMO_CYCLONES)
  const [selectedStorm, setSelectedStorm] = useState<string>(DEMO_CYCLONES[0].storm_id)
  const [isLive] = useState(false)

  const activeStorm = cyclones.find(c => c.storm_id === selectedStorm) || cyclones[0]

  return (
    <div className="dashboard-layout">
      <Header isLive={isLive} stormCount={cyclones.length} />

      <aside className="sidebar-left">
        <StormList
          cyclones={cyclones}
          selectedId={selectedStorm}
          onSelect={setSelectedStorm}
        />
      </aside>

      <main className="main-content">
        <MapView storm={activeStorm} />
      </main>

      <aside className="sidebar-right">
        <AnalysisPanel storm={activeStorm} />
      </aside>
    </div>
  )
}
