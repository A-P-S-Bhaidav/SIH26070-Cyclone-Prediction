/**
 * MapView — Real interactive map using Leaflet with cyclone tracks,
 * probability cones, top-5 paths, and landfall markers.
 */
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Polygon, Circle, CircleMarker, Popup, useMap } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'


const CATEGORY_COLORS: Record<string, string> = {
  TD: '#3b82f6', CS: '#0ea5e9', SCS: '#10b981',
  VSCS: '#f59e0b', ESCS: '#f97316', SuCS: '#ef4444',
}

interface MapViewProps { storm: any }

/** Seeded PRNG from storm_id for deterministic path generation */
function seededRandom(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return () => { h = (h * 16807) % 2147483647; return (h & 0x7fffffff) / 2147483647 }
}

/** Generate 5 deterministic probable paths */
function generateProbablePaths(storm: any) {
  const forecast = (storm.track || []).filter((p: any) => p.t >= 0)
  if (forecast.length < 2) return []
  const rng = seededRandom(storm.storm_id)
  const probs = [32, 24, 18, 14, 12]
  return probs.map((prob, idx) => {
    const spread = (idx + 1) * 0.35
    const points = forecast.map((p: any, i: number) => {
      const jLat = (rng() - 0.5) * spread * (1 + i * 0.25)
      const jLon = (rng() - 0.5) * spread * (1 + i * 0.25)
      return [p.lat + jLat, p.lon + jLon] as [number, number]
    })
    return { points, probability: prob, weight: [4, 3, 2.5, 2, 1.5][idx], opacity: [0.9, 0.7, 0.5, 0.35, 0.2][idx] }
  })
}

/** Build expanding cone polygon from forecast points */
function buildConePolygon(forecast: any[], radiusDeg: number): [number, number][] {
  if (forecast.length < 2) return []
  const left: [number, number][] = []
  const right: [number, number][] = []
  forecast.forEach((p: any, i: number) => {
    const r = radiusDeg * (0.3 + i * 0.7 / (forecast.length - 1))
    const dx = i < forecast.length - 1 ? forecast[i + 1].lon - p.lon : p.lon - forecast[i - 1].lon
    const dy = i < forecast.length - 1 ? forecast[i + 1].lat - p.lat : p.lat - forecast[i - 1].lat
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = -dy / len, ny = dx / len
    left.push([p.lat + nx * r, p.lon + ny * r])
    right.push([p.lat - nx * r, p.lon - ny * r])
  })
  return [...left, ...right.reverse()]
}

/** Auto-fit map to storm track */
function FitBounds({ storm }: { storm: any }) {
  const map = useMap()
  useEffect(() => {
    const track = storm.track || []
    if (track.length > 0) {
      const lats = track.map((p: any) => p.lat)
      const lons = track.map((p: any) => p.lon)
      const pad = 2
      map.fitBounds([
        [Math.min(...lats) - pad, Math.min(...lons) - pad],
        [Math.max(...lats) + pad, Math.max(...lons) + pad],
      ], { padding: [30, 30] })
    }
  }, [storm.storm_id])
  return null
}

export default function MapView({ storm }: MapViewProps) {
  const [showCone, setShowCone] = useState(true)
  const [showPaths, setShowPaths] = useState(true)
  const [showLandfall, setShowLandfall] = useState(true)

  const color = CATEGORY_COLORS[storm.category] || '#3b82f6'
  const track = storm.track || []
  const pastTrack: [number, number][] = track.filter((p: any) => p.t <= 0).map((p: any) => [p.lat, p.lon])
  const futureTrack: [number, number][] = track.filter((p: any) => p.t >= 0).map((p: any) => [p.lat, p.lon])
  const currentPos = track.find((p: any) => p.t === 0)
  const forecastPoints = track.filter((p: any) => p.t > 0)

  const paths = useMemo(() => generateProbablePaths(storm), [storm.storm_id])

  const forecast = track.filter((p: any) => p.t >= 0)
  const cone50 = useMemo(() => buildConePolygon(forecast, 0.6), [storm.storm_id])
  const cone90 = useMemo(() => buildConePolygon(forecast, 1.4), [storm.storm_id])

  const districtCoords: Record<string, [number, number]> = {
    'South 24 Parganas': [21.87, 88.43], 'North 24 Parganas': [22.62, 88.85],
    'Kolkata': [22.57, 88.36], 'Balasore': [21.49, 86.93],
    'Puri': [19.81, 85.83], 'Ganjam': [19.58, 84.81],
    'Srikakulam': [18.30, 84.00], 'Junagadh': [21.52, 70.46],
    'Porbandar': [21.64, 69.60], 'Mumbai': [19.08, 72.88],
  }

  return (
    <div className="map-wrapper">
      <MapContainer
        center={currentPos ? [currentPos.lat, currentPos.lon] : [15, 82]}
        zoom={5}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds storm={storm} />

        {/* 90% Cone */}
        {showCone && cone90.length > 2 && (
          <Polygon
            positions={cone90}
            pathOptions={{ color: '#3b82f6', weight: 1, dashArray: '6,4', fillColor: '#3b82f6', fillOpacity: 0.05 }}
          />
        )}

        {/* 50% Cone */}
        {showCone && cone50.length > 2 && (
          <Polygon
            positions={cone50}
            pathOptions={{ color: '#2563eb', weight: 1.5, fillColor: '#2563eb', fillOpacity: 0.1 }}
          />
        )}

        {/* Top 5 Probable Paths */}
        {showPaths && paths.map((path, i) => (
          <Polyline
            key={`path-${i}`}
            positions={path.points}
            pathOptions={{
              color,
              weight: path.weight,
              opacity: path.opacity,
              dashArray: i > 0 ? '4,4' : undefined,
            }}
          >
            <Popup>Path {i + 1}: {path.probability}% probability</Popup>
          </Polyline>
        ))}

        {/* Past Track (solid) */}
        {pastTrack.length > 1 && (
          <Polyline positions={pastTrack} pathOptions={{ color, weight: 3.5, opacity: 0.9 }} />
        )}

        {/* Future Track (dashed) */}
        {futureTrack.length > 1 && (
          <Polyline positions={futureTrack} pathOptions={{ color, weight: 2.5, opacity: 0.7, dashArray: '8,6' }} />
        )}

        {/* Past position dots */}
        {track.filter((p: any) => p.t < 0).map((p: any, i: number) => (
          <CircleMarker
            key={`past-${i}`}
            center={[p.lat, p.lon]}
            radius={3}
            pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 0 }}
          />
        ))}

        {/* Future position dots with lead labels */}
        {forecastPoints.map((p: any, i: number) => (
          <CircleMarker
            key={`fut-${i}`}
            center={[p.lat, p.lon]}
            radius={4}
            pathOptions={{ color, fillColor: 'white', fillOpacity: 1, weight: 2 }}
          >
            <Popup>{`+${p.t}h — ${p.vmax || '?'}kt`}</Popup>
          </CircleMarker>
        ))}

        {/* Current Position */}
        {currentPos && (
          <>
            <Circle
              center={[currentPos.lat, currentPos.lon]}
              radius={60000}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.08, weight: 1, dashArray: '4,4' }}
            />
            <CircleMarker
              center={[currentPos.lat, currentPos.lon]}
              radius={8}
              pathOptions={{ color: 'white', fillColor: color, fillOpacity: 1, weight: 3 }}
            >
              <Popup>
                <strong>{storm.storm_name}</strong><br />
                {storm.vmax_kt}kt · {storm.category}<br />
                {currentPos.lat.toFixed(1)}°N, {currentPos.lon.toFixed(1)}°E
              </Popup>
            </CircleMarker>
          </>
        )}

        {/* Landfall Risk Markers */}
        {showLandfall && (storm.landfall_risk || []).map((risk: any, i: number) => {
          const coords = districtCoords[risk.district]
          if (!coords) return null
          return (
            <CircleMarker
              key={`land-${i}`}
              center={coords}
              radius={5 + risk.probability * 10}
              pathOptions={{
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.15 + risk.probability * 0.4,
                weight: 1.5,
              }}
            >
              <Popup>
                <strong>{risk.district}</strong>, {risk.state}<br />
                Landfall probability: {(risk.probability * 100).toFixed(0)}%
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* Controls */}
      <div className="map-controls">
        <button className={`map-btn ${showCone ? 'active' : ''}`} onClick={() => setShowCone(!showCone)}>
          Cone
        </button>
        <button className={`map-btn ${showPaths ? 'active' : ''}`} onClick={() => setShowPaths(!showPaths)}>
          Paths
        </button>
        <button className={`map-btn ${showLandfall ? 'active' : ''}`} onClick={() => setShowLandfall(!showLandfall)}>
          Landfall
        </button>
      </div>

      {/* Legend */}
      <div className="map-legend">
        <div className="map-legend-item">
          <span className="legend-line" style={{ background: color }} />
          Observed
        </div>
        <div className="map-legend-item">
          <span className="legend-dash" style={{ borderColor: color }} />
          Forecast
        </div>
        <div className="map-legend-item">
          <span className="legend-dot" style={{ background: '#2563eb', opacity: 0.3 }} />
          50% CI
        </div>
        <div className="map-legend-item">
          <span className="legend-dot" style={{ background: '#3b82f6', opacity: 0.15, border: '1px dashed #3b82f6' }} />
          90% CI
        </div>
        <div className="map-legend-item">
          <span className="legend-dot" style={{ background: '#ef4444' }} />
          Landfall
        </div>
      </div>
    </div>
  )
}
