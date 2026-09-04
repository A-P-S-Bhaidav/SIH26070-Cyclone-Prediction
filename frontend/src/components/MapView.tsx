/**
 * MapView — Leaflet map with 20 predicted paths, expanding cones, landfall HEATMAP.
 * Uses OpenStreetMap tiles (no API key).
 */
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Polygon, Circle, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'

const SEV: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981', VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}

function seededRng(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return () => { h = (h * 16807 + 12345) % 2147483647; return (h & 0x7fffffff) / 2147483647 }
}

function generate20Paths(storm: any) {
  const fc = (storm.track || []).filter((p: any) => p.t >= 0)
  if (fc.length < 2) return []
  const rng = seededRng(storm.storm_id + 'paths')
  const total = 20
  const probabilities: number[] = []
  let remaining = 100
  for (let i = 0; i < total; i++) {
    const p = i === total - 1 ? remaining : Math.max(1, Math.round(remaining * (0.15 + rng() * 0.25)))
    probabilities.push(p)
    remaining -= p
    if (remaining <= 0) remaining = 1
  }
  probabilities.sort((a, b) => b - a)

  return probabilities.map((prob, idx) => {
    const spread = 0.15 + idx * 0.12
    const points: [number, number][] = fc.map((p: any, i: number) => {
      const jLat = (rng() - 0.5) * spread * (1 + i * 0.3)
      const jLon = (rng() - 0.5) * spread * (1 + i * 0.3)
      return [p.lat + jLat, p.lon + jLon]
    })
    const maxOpacity = 0.8
    const minOpacity = 0.05
    const opacity = maxOpacity - (idx / (total - 1)) * (maxOpacity - minOpacity)
    const weight = Math.max(0.5, 3.5 - idx * 0.15)
    return { points, probability: prob, opacity, weight }
  })
}

function buildCone(fc: any[], radius: number): [number, number][] {
  if (fc.length < 2) return []
  const left: [number, number][] = [], right: [number, number][] = []
  fc.forEach((p: any, i: number) => {
    const r = radius * (0.2 + i * 0.8 / (fc.length - 1))
    const dx = i < fc.length - 1 ? fc[i + 1].lon - p.lon : p.lon - fc[i - 1].lon
    const dy = i < fc.length - 1 ? fc[i + 1].lat - p.lat : p.lat - fc[i - 1].lat
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = -dy / len, ny = dx / len
    left.push([p.lat + nx * r, p.lon + ny * r])
    right.push([p.lat - nx * r, p.lon - ny * r])
  })
  return [...left, ...right.reverse()]
}

function FitBounds({ storm }: { storm: any }) {
  const map = useMap()
  useEffect(() => {
    const t = storm.track || []
    if (t.length > 0) {
      const lats = t.map((p: any) => p.lat), lons = t.map((p: any) => p.lon)
      map.fitBounds([[Math.min(...lats) - 1.5, Math.min(...lons) - 1.5], [Math.max(...lats) + 1.5, Math.max(...lons) + 1.5]], { padding: [20, 20] })
    }
  }, [storm.storm_id])
  return null
}

// Landfall Heatmap Layer — uses leaflet.heat
const DISTRICTS: Record<string, [number, number]> = {
  'South 24 Parganas': [21.87, 88.43], 'North 24 Parganas': [22.62, 88.85],
  'Kolkata': [22.57, 88.36], 'Balasore': [21.49, 86.93], 'Puri': [19.81, 85.83],
  'Ganjam': [19.58, 84.81], 'Srikakulam': [18.3, 84], 'Junagadh': [21.52, 70.46],
  'Porbandar': [21.64, 69.6], 'Mumbai': [19.08, 72.88],
}

function LandfallHeatmap({ risks, visible }: { risks: any[]; visible: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!visible || !risks || risks.length === 0) return

    // Build heatmap data: each risk generates a cluster of nearby points for spread
    const heatData: [number, number, number][] = []
    const rng = seededRng('landfall-heat')

    risks.forEach((r: any) => {
      const coords = DISTRICTS[r.district]
      if (!coords) return
      const [lat, lon] = coords
      const intensity = r.probability

      // Create a cluster of points around the district for a natural heatmap spread
      const numPoints = Math.max(8, Math.round(intensity * 30))
      const spread = 0.15 + intensity * 0.25 // higher probability = wider spread
      for (let i = 0; i < numPoints; i++) {
        const dlat = (rng() - 0.5) * spread * 2
        const dlon = (rng() - 0.5) * spread * 2
        heatData.push([lat + dlat, lon + dlon, intensity])
      }
    })

    const heat = L.heatLayer(heatData, {
      radius: 35,
      blur: 25,
      maxZoom: 10,
      max: 1,
      gradient: {
        0.1: '#fee2e2',   // very light red
        0.25: '#fca5a5',  // light red
        0.4: '#f87171',   // medium red
        0.55: '#ef4444',  // red
        0.7: '#dc2626',   // darker red
        0.85: '#b91c1c',  // deep red
        1.0: '#7f1d1d',   // darkest red
      }
    })

    heat.addTo(map)
    return () => { map.removeLayer(heat) }
  }, [risks, visible, map])

  return null
}

export default function MapView({ storm }: { storm: any }) {
  const [showCone, setShowCone] = useState(true)
  const [showPaths, setShowPaths] = useState(true)
  const [showLandfall, setShowLandfall] = useState(true)

  const color = SEV[storm.category] || '#3b82f6'
  const track = storm.track || []
  const past: [number, number][] = track.filter((p: any) => p.t <= 0).map((p: any) => [p.lat, p.lon])
  const future: [number, number][] = track.filter((p: any) => p.t >= 0).map((p: any) => [p.lat, p.lon])
  const cur = track.find((p: any) => p.t === 0)
  const fcPoints = track.filter((p: any) => p.t > 0)
  const fc = track.filter((p: any) => p.t >= 0)

  const paths = useMemo(() => generate20Paths(storm), [storm.storm_id])
  const cone50 = useMemo(() => buildCone(fc, 0.6), [storm.storm_id])
  const cone90 = useMemo(() => buildCone(fc, 1.4), [storm.storm_id])

  return (
    <div className="map-wrapper">
      <MapContainer center={cur ? [cur.lat, cur.lon] : [15, 82]} zoom={5}
        style={{ width: '100%', height: '100%' }} zoomControl={true} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds storm={storm} />

        {/* Confidence Cones */}
        {showCone && cone90.length > 2 && (
          <Polygon positions={cone90} pathOptions={{ color: '#3b82f6', weight: 1, dashArray: '5,4', fillColor: '#3b82f6', fillOpacity: 0.04 }} />
        )}
        {showCone && cone50.length > 2 && (
          <Polygon positions={cone50} pathOptions={{ color: '#2563eb', weight: 1.5, fillColor: '#2563eb', fillOpacity: 0.08 }} />
        )}

        {/* 20 Predicted Paths */}
        {showPaths && paths.map((path, i) => (
          <Polyline key={`p${i}`} positions={path.points}
            pathOptions={{ color, weight: path.weight, opacity: path.opacity, dashArray: i > 2 ? '3,3' : undefined }}>
            {i < 5 && <Tooltip permanent direction="right" offset={[6, 0]}
              className="path-tooltip">{path.probability}%</Tooltip>}
          </Polyline>
        ))}

        {/* Past Track */}
        {past.length > 1 && <Polyline positions={past} pathOptions={{ color, weight: 3, opacity: 0.9 }} />}
        {/* Forecast Track */}
        {future.length > 1 && <Polyline positions={future} pathOptions={{ color, weight: 2.5, opacity: 0.7, dashArray: '8,5' }} />}

        {/* Past Track Points */}
        {track.filter((p: any) => p.t < 0).map((p: any, i: number) => (
          <CircleMarker key={`h${i}`} center={[p.lat, p.lon]} radius={2.5}
            pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 0 }} />
        ))}

        {/* Forecast Points */}
        {fcPoints.map((p: any, i: number) => (
          <CircleMarker key={`f${i}`} center={[p.lat, p.lon]} radius={3.5}
            pathOptions={{ color, fillColor: 'white', fillOpacity: 1, weight: 1.5 }}>
            <Popup>{`+${p.t}h — ${p.vmax || '?'}kt`}</Popup>
          </CircleMarker>
        ))}

        {/* Current Position */}
        {cur && (
          <>
            <Circle center={[cur.lat, cur.lon]} radius={50000}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.06, weight: 1, dashArray: '4,3' }} />
            <CircleMarker center={[cur.lat, cur.lon]} radius={7}
              pathOptions={{ color: 'white', fillColor: color, fillOpacity: 1, weight: 2.5 }}>
              <Popup><strong>{storm.storm_name}</strong><br/>{storm.vmax_kt}kt · {storm.category}</Popup>
            </CircleMarker>
          </>
        )}

        {/* Landfall Heatmap — replaces red circles */}
        <LandfallHeatmap risks={storm.landfall_risk || []} visible={showLandfall} />
      </MapContainer>

      <div className="map-controls">
        <button className={`map-btn ${showCone ? 'active' : ''}`} onClick={() => setShowCone(!showCone)}>Cone</button>
        <button className={`map-btn ${showPaths ? 'active' : ''}`} onClick={() => setShowPaths(!showPaths)}>Paths</button>
        <button className={`map-btn ${showLandfall ? 'active' : ''}`} onClick={() => setShowLandfall(!showLandfall)}>Landfall</button>
      </div>

      <div className="map-legend">
        <div className="map-legend-item"><span className="legend-line" style={{ background: color }} />Track</div>
        <div className="map-legend-item"><span className="legend-dash" style={{ borderColor: color }} />Forecast</div>
        <div className="map-legend-item"><span className="legend-dot" style={{ background: '#2563eb', opacity: 0.3 }} />50% CI</div>
        <div className="map-legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />Landfall Risk</div>
      </div>
    </div>
  )
}
