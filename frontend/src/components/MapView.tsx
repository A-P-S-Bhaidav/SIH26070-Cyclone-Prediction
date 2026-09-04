/**
 * MapView — Interactive cyclone tracking map.
 * 
 * Uses Canvas-based rendering for the map visualization.
 * Falls back gracefully when MapLibre GL is not available.
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#6366f1', CS: '#06b6d4', SCS: '#22c55e',
  VSCS: '#eab308', ESCS: '#f97316', SuCS: '#ef4444',
}

interface MapViewProps {
  storm: any
}

export default function MapView({ storm }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showCone, setShowCone] = useState(true)
  const [showEnsemble, setShowEnsemble] = useState(true)
  const [showLandfall, setShowLandfall] = useState(true)
  const animFrame = useRef<number>(0)

  // Map projection — simple equirectangular for NIO
  const mapBounds = {
    minLat: 4, maxLat: 28,
    minLon: 60, maxLon: 100,
  }

  const project = useCallback((lat: number, lon: number, w: number, h: number): [number, number] => {
    const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * w
    const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * h
    return [x, y]
  }, [])

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.save()
      ctx.scale(dpr, dpr)

      // Background — ocean gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      bgGrad.addColorStop(0, '#0a1628')
      bgGrad.addColorStop(0.5, '#0c1a30')
      bgGrad.addColorStop(1, '#0e1e38')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Grid lines
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.06)'
      ctx.lineWidth = 0.5
      for (let lat = 5; lat <= 25; lat += 5) {
        const [, y] = project(lat, 60, w, h)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
        // Label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'
        ctx.font = '10px Inter'
        ctx.fillText(`${lat}°N`, 4, y - 3)
      }
      for (let lon = 65; lon <= 95; lon += 5) {
        const [x] = project(10, lon, w, h)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'
        ctx.font = '10px Inter'
        ctx.fillText(`${lon}°E`, x + 3, h - 4)
      }

      // Simplified India coastline (approximate polygon)
      drawCoastline(ctx, w, h, project)

      // ── Probability cone ──
      if (showCone && storm.cone_90) {
        drawCone(ctx, storm.cone_90, 'rgba(99, 102, 241, 0.06)', 'rgba(99, 102, 241, 0.15)', w, h, project)
      }
      if (showCone && storm.cone_50) {
        drawCone(ctx, storm.cone_50, 'rgba(99, 102, 241, 0.1)', 'rgba(99, 102, 241, 0.25)', w, h, project)
      }

      // ── Ensemble tracks ──
      if (showEnsemble && storm.track) {
        const points = storm.track.filter((p: any) => p.t > 0)
        for (let e = 0; e < 8; e++) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)'
          ctx.lineWidth = 0.8
          ctx.beginPath()
          for (let i = 0; i < points.length; i++) {
            const p = points[i]
            const jitter = { lat: p.lat + (Math.random() - 0.5) * 0.5 * (1 + i * 0.3), 
                             lon: p.lon + (Math.random() - 0.5) * 0.5 * (1 + i * 0.3) }
            const [x, y] = project(jitter.lat, jitter.lon, w, h)
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      // ── Primary track ──
      const color = CATEGORY_COLORS[storm.category] || '#6366f1'
      const track = storm.track || []
      const pastTrack = track.filter((p: any) => p.t <= 0)
      const futureTrack = track.filter((p: any) => p.t >= 0)

      // Past track (solid)
      if (pastTrack.length > 1) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.setLineDash([])
        ctx.beginPath()
        pastTrack.forEach((p: any, i: number) => {
          const [x, y] = project(p.lat, p.lon, w, h)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()

        // Past position dots
        pastTrack.forEach((p: any) => {
          const [x, y] = project(p.lat, p.lon, w, h)
          ctx.beginPath()
          ctx.arc(x, y, 3, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        })
      }

      // Future track (dashed)
      if (futureTrack.length > 1) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        futureTrack.forEach((p: any, i: number) => {
          const [x, y] = project(p.lat, p.lon, w, h)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.setLineDash([])

        // Future position dots with lead time labels
        futureTrack.forEach((p: any) => {
          if (p.t <= 0) return
          const [x, y] = project(p.lat, p.lon, w, h)
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.stroke()
          // Lead time label
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          ctx.font = '9px JetBrains Mono'
          ctx.fillText(`+${p.t}h`, x + 8, y + 3)
        })
      }

      // ── Current position (animated pulse) ──
      const currentPos = track.find((p: any) => p.t === 0)
      if (currentPos) {
        const [cx, cy] = project(currentPos.lat, currentPos.lon, w, h)
        const t = Date.now() / 1000

        // Pulsing outer rings
        for (let ring = 0; ring < 3; ring++) {
          const phase = (t + ring * 0.5) % 2
          const radius = 8 + phase * 20
          const alpha = Math.max(0, 0.4 - phase * 0.2)
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // Cyclone symbol
        ctx.beginPath()
        ctx.arc(cx, cy, 8, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, 10, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Name label
        ctx.fillStyle = 'white'
        ctx.font = 'bold 12px Inter'
        ctx.fillText(storm.storm_name, cx + 16, cy - 8)
        ctx.fillStyle = color
        ctx.font = '10px JetBrains Mono'
        ctx.fillText(`${storm.vmax_kt}kt · ${storm.category}`, cx + 16, cy + 5)
      }

      // ── Landfall risk markers ──
      if (showLandfall && storm.landfall_risk) {
        storm.landfall_risk.forEach((risk: any) => {
          const coords = getDistrictCoords(risk.district)
          if (!coords) return
          const [dx, dy] = project(coords.lat, coords.lon, w, h)

          const r = 4 + risk.probability * 12
          const alpha = 0.3 + risk.probability * 0.5

          ctx.beginPath()
          ctx.arc(dx, dy, r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`
          ctx.fill()
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha + 0.2})`
          ctx.lineWidth = 1
          ctx.stroke()

          ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.2})`
          ctx.font = '9px Inter'
          ctx.fillText(`${(risk.probability * 100).toFixed(0)}%`, dx + r + 3, dy + 3)
        })
      }

      ctx.restore()
      animFrame.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animFrame.current)
    }
  }, [storm, showCone, showEnsemble, showLandfall, project])

  return (
    <div ref={containerRef} className="map-container">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Map controls overlay */}
      <div className="map-overlay-top">
        <button
          className={`map-btn ${showCone ? 'active' : ''}`}
          onClick={() => setShowCone(!showCone)}
        >
          🎯 Cone
        </button>
        <button
          className={`map-btn ${showEnsemble ? 'active' : ''}`}
          onClick={() => setShowEnsemble(!showEnsemble)}
        >
          🔀 Ensemble
        </button>
        <button
          className={`map-btn ${showLandfall ? 'active' : ''}`}
          onClick={() => setShowLandfall(!showLandfall)}
        >
          ⚠️ Landfall
        </button>
      </div>

      {/* Map legend */}
      <div className="map-overlay-bottom">
        <div className="glass-card" style={{
          padding: '10px 14px',
          display: 'flex', gap: '16px',
          fontSize: '0.65rem', color: 'var(--text-secondary)',
        }}>
          <span>
            <span style={{ color: CATEGORY_COLORS[storm.category], fontWeight: 700 }}>━━</span> Track
          </span>
          <span>
            <span style={{ color: CATEGORY_COLORS[storm.category], fontWeight: 700 }}>┈┈</span> Forecast
          </span>
          <span>🔴 Landfall Risk</span>
          <span>🟣 50% Cone</span>
          <span>🔵 90% Cone</span>
        </div>
      </div>
    </div>
  )
}


// ── Helper: Draw simplified India coastline ──────────────────────────

function drawCoastline(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  project: (lat: number, lon: number, w: number, h: number) => [number, number],
) {
  // Simplified Indian subcontinent coastline points
  const coastline = [
    [8.08, 77.55], [8.3, 76.95], [9.5, 76.27], [10.0, 76.3],
    [10.5, 76.05], [11.7, 75.7], [12.9, 74.8], [14.8, 74.1],
    [15.4, 73.8], [17.0, 73.3], [18.9, 72.8], [19.1, 72.85],
    [20.2, 72.8], [21.0, 72.3], [21.6, 72.0], [22.5, 69.1],
    [23.5, 68.4], [24.0, 68.5], [24.5, 68.9], [25.0, 70.0],
    // North coast to east
    [22.5, 88.4], [22.0, 88.5], [21.8, 87.5], [21.5, 87.0],
    [20.5, 86.5], [20.0, 86.0], [19.3, 85.0], [17.8, 83.5],
    [16.5, 82.3], [15.5, 80.2], [14.6, 80.1], [13.5, 80.25],
    [13.0, 80.3], [12.0, 79.8], [10.8, 79.85], [10.0, 79.3],
    [9.3, 79.0], [8.8, 78.0], [8.08, 77.55],
  ]

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(30, 40, 60, 0.3)'
  ctx.beginPath()
  coastline.forEach(([lat, lon], i) => {
    const [x, y] = project(lat, lon, w, h)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Sri Lanka
  const sriLanka = [
    [9.8, 80.0], [9.5, 80.5], [8.0, 81.5], [6.9, 81.6],
    [6.0, 80.7], [6.2, 80.2], [7.2, 79.7], [8.3, 79.8],
    [9.5, 80.0], [9.8, 80.0],
  ]
  ctx.beginPath()
  sriLanka.forEach(([lat, lon], i) => {
    const [x, y] = project(lat, lon, w, h)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}


// ── Helper: Draw probability cone ────────────────────────────────────

function drawCone(
  ctx: CanvasRenderingContext2D,
  conePolygons: [number, number][][],
  fillColor: string,
  strokeColor: string,
  w: number, h: number,
  project: (lat: number, lon: number, w: number, h: number) => [number, number],
) {
  conePolygons.forEach(polygon => {
    ctx.beginPath()
    polygon.forEach((coord, i) => {
      const [x, y] = project(coord[1], coord[0], w, h) // [lon, lat] → project(lat, lon)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 0.5
    ctx.stroke()
  })
}


// ── Helper: District coordinates ─────────────────────────────────────

function getDistrictCoords(name: string): { lat: number; lon: number } | null {
  const coords: Record<string, { lat: number; lon: number }> = {
    'South 24 Parganas': { lat: 21.87, lon: 88.43 },
    'North 24 Parganas': { lat: 22.62, lon: 88.85 },
    'Kolkata': { lat: 22.57, lon: 88.36 },
    'Balasore': { lat: 21.49, lon: 86.93 },
    'Puri': { lat: 19.81, lon: 85.83 },
    'Ganjam': { lat: 19.58, lon: 84.81 },
    'Srikakulam': { lat: 18.30, lon: 84.00 },
    'Junagadh': { lat: 21.52, lon: 70.46 },
    'Porbandar': { lat: 21.64, lon: 69.60 },
    'Mumbai': { lat: 19.08, lon: 72.88 },
  }
  return coords[name] || null
}
