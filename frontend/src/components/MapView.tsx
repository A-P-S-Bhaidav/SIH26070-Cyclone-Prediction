import { useRef, useEffect, useState, useCallback } from 'react'

const CATEGORY_COLORS: Record<string, string> = {
  TD: '#5b8def', CS: '#00b4d8', SCS: '#2ec4b6',
  VSCS: '#e9c46a', ESCS: '#f4845f', SuCS: '#e63946',
}

interface MapViewProps {
  storm: any
}

// Simple seeded PRNG
function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}
function sfc32(a: number, b: number, c: number, d: number) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
    let t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
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
      
      // Better anti-aliasing
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Background — ocean gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h)
      bgGrad.addColorStop(0, '#050a15')
      bgGrad.addColorStop(1, '#0a1225')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, w, h)

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'
      ctx.lineWidth = 0.5
      for (let lat = 5; lat <= 25; lat += 5) {
        const [, y] = project(lat, 60, w, h)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)'
        ctx.font = '10px "JetBrains Mono", monospace'
        ctx.fillText(`${lat}°N`, 4, y - 3)
      }
      for (let lon = 65; lon <= 95; lon += 5) {
        const [x] = project(10, lon, w, h)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)'
        ctx.font = '10px "JetBrains Mono", monospace'
        ctx.fillText(`${lon}°E`, x + 3, h - 4)
      }

      // Simplified India coastline (approximate polygon)
      drawCoastline(ctx, w, h, project)

      const color = CATEGORY_COLORS[storm.category] || '#00b4d8'
      const track = storm.track || []
      const points = track.filter((p: any) => p.t > 0)
      
      // ── Probability cone ──
      if (showCone && storm.cone_90) {
        drawCone(ctx, storm.cone_90, 'rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.15)', w, h, project, true)
        
        // Label for 90%
        if (storm.cone_90.length > 0 && storm.cone_90[0].length > 0) {
          const lastPolygon = storm.cone_90[storm.cone_90.length - 1]
          const lastPt = lastPolygon[Math.floor(lastPolygon.length / 2)]
          if (lastPt) {
            const [lx, ly] = project(lastPt[1], lastPt[0], w, h)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.font = '10px Inter, sans-serif'
            ctx.fillText('90% CI', lx + 10, ly)
          }
        }
      }
      if (showCone && storm.cone_50) {
        drawCone(ctx, storm.cone_50, 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.3)', w, h, project, false)
        
        // Label for 50%
        if (storm.cone_50.length > 0 && storm.cone_50[0].length > 0) {
          const lastPolygon = storm.cone_50[storm.cone_50.length - 1]
          const lastPt = lastPolygon[Math.floor(lastPolygon.length / 2)]
          if (lastPt) {
            const [lx, ly] = project(lastPt[1], lastPt[0], w, h)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
            ctx.font = '10px Inter, sans-serif'
            ctx.fillText('50% CI', lx + 10, ly + 15)
          }
        }
      }

      // ── Ensemble tracks (Top 5 Paths) ──
      if (showEnsemble && points.length > 1) {
        const seedStr = storm.storm_id || storm.storm_name || 'default-seed'
        const seed = cyrb128(seedStr)
        const rand = sfc32(seed[0], seed[1], seed[2], seed[3])
        
        const pathStyles = [
          { prob: '32%', width: 3, glow: 15, alpha: 1.0 },
          { prob: '24%', width: 2.5, glow: 10, alpha: 0.8 },
          { prob: '18%', width: 2, glow: 5, alpha: 0.6 },
          { prob: '14%', width: 1.5, glow: 2, alpha: 0.4 },
          { prob: '12%', width: 1, glow: 0, alpha: 0.2 },
        ]

        for (let e = 0; e < 5; e++) {
          const style = pathStyles[e]
          const pathPoints = []
          
          for (let i = 0; i < points.length; i++) {
            const p = points[i]
            // Diverge more as time goes on
            const divergence = (i * 0.15)
            const dLat = (rand() - 0.5) * divergence
            const dLon = (rand() - 0.5) * divergence
            pathPoints.push({ lat: p.lat + dLat, lon: p.lon + dLon })
          }

          ctx.strokeStyle = `rgba(255, 255, 255, ${style.alpha})`
          ctx.lineWidth = style.width
          ctx.shadowColor = `rgba(255, 255, 255, ${style.alpha})`
          ctx.shadowBlur = style.glow

          drawSmoothCurve(ctx, pathPoints, project, w, h)
          
          ctx.shadowBlur = 0 // reset shadow
          
          // Label at the end
          const lastP = pathPoints[pathPoints.length - 1]
          const [lx, ly] = project(lastP.lat, lastP.lon, w, h)
          ctx.fillStyle = `rgba(255, 255, 255, ${style.alpha})`
          ctx.font = '9px "JetBrains Mono", monospace'
          ctx.fillText(style.prob, lx + 5, ly)
        }
      }

      // ── Primary track ──
      const pastTrack = track.filter((p: any) => p.t <= 0)
      const futureTrack = track.filter((p: any) => p.t >= 0)

      // Past track (solid)
      if (pastTrack.length > 1) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.setLineDash([])
        drawSmoothCurve(ctx, pastTrack, project, w, h)

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
        drawSmoothCurve(ctx, futureTrack, project, w, h)
        ctx.setLineDash([])

        // Future position dots with lead time labels
        futureTrack.forEach((p: any) => {
          if (p.t <= 0) return
          const [x, y] = project(p.lat, p.lon, w, h)
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#050a15'
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5
          ctx.stroke()
          // Lead time label
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.font = '9px "JetBrains Mono", monospace'
          ctx.fillText(`+${p.t}h`, x + 8, y + 3)
        })
      }

      // ── Current position (Animated radar-sweep) ──
      const currentPos = track.find((p: any) => p.t === 0)
      if (currentPos) {
        const [cx, cy] = project(currentPos.lat, currentPos.lon, w, h)
        const time = Date.now() / 1000
        
        // Radar sweep
        const sweepAngle = (time * 2) % (Math.PI * 2)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(sweepAngle)
        
        const radarGrad = ctx.createConicGradient(0, 0, 0)
        radarGrad.addColorStop(0, 'rgba(255, 255, 255, 0)')
        radarGrad.addColorStop(0.9, 'rgba(255, 255, 255, 0.1)')
        radarGrad.addColorStop(1, color)
        
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, 24, 0, Math.PI / 2)
        ctx.lineTo(0, 0)
        ctx.fillStyle = radarGrad
        ctx.fill()
        ctx.restore()

        // Core marker
        ctx.beginPath()
        ctx.arc(cx, cy, 6, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Name label
        ctx.fillStyle = 'white'
        ctx.font = 'bold 12px Inter, sans-serif'
        ctx.fillText(storm.storm_name, cx + 16, cy - 8)
        ctx.fillStyle = color
        ctx.font = '10px "JetBrains Mono", monospace'
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
          ctx.font = '9px "JetBrains Mono", monospace'
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
    <div ref={containerRef} className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Map controls overlay */}
      <div className="map-overlay-top" style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: '8px' }}>
        <button
          className={`map-btn ${showCone ? 'active' : ''}`}
          onClick={() => setShowCone(!showCone)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '99px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: showCone ? 'rgba(0, 180, 216, 0.2)' : 'rgba(10, 18, 37, 0.6)',
            color: showCone ? '#00b4d8' : 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            fontSize: '13px', fontWeight: 500
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          Cone
        </button>
        <button
          className={`map-btn ${showEnsemble ? 'active' : ''}`}
          onClick={() => setShowEnsemble(!showEnsemble)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '99px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: showEnsemble ? 'rgba(0, 180, 216, 0.2)' : 'rgba(10, 18, 37, 0.6)',
            color: showEnsemble ? '#00b4d8' : 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            fontSize: '13px', fontWeight: 500
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 3v18M18 16a3 3 0 100-6 3 3 0 000 6zM6 13c3.5 0 8 1.5 8 5" />
          </svg>
          Paths
        </button>
        <button
          className={`map-btn ${showLandfall ? 'active' : ''}`}
          onClick={() => setShowLandfall(!showLandfall)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '99px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: showLandfall ? 'rgba(0, 180, 216, 0.2)' : 'rgba(10, 18, 37, 0.6)',
            color: showLandfall ? '#00b4d8' : 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            fontSize: '13px', fontWeight: 500
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Landfall
        </button>
      </div>

      {/* Map legend */}
      <div className="map-overlay-bottom" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
        <div className="glass-card" style={{
          padding: '10px 16px',
          display: 'flex', gap: '20px',
          fontSize: '12px', color: 'rgba(255,255,255,0.7)',
          background: 'rgba(10, 18, 37, 0.6)',
          backdropFilter: 'blur(8px)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.05)',
          whiteSpace: 'nowrap'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', background: CATEGORY_COLORS[storm.category] || '#00b4d8', display: 'inline-block' }}></span> 
            Observed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', background: `repeating-linear-gradient(90deg, ${CATEGORY_COLORS[storm.category] || '#00b4d8'} 0, ${CATEGORY_COLORS[storm.category] || '#00b4d8'} 4px, transparent 4px, transparent 8px)`, display: 'inline-block' }}></span> 
            Forecast
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: 'rgba(255, 255, 255, 0.3)', border: '1px solid rgba(255, 255, 255, 0.6)', display: 'inline-block', borderRadius: '2px' }}></span> 
            50% CI
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: 'rgba(255, 255, 255, 0.15)', border: '1px dashed rgba(255, 255, 255, 0.3)', display: 'inline-block', borderRadius: '2px' }}></span> 
            90% CI
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', background: 'rgba(255, 255, 255, 0.8)', boxShadow: '0 0 4px rgba(255,255,255,0.8)', display: 'inline-block' }}></span> 
            Probable Paths
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span> 
            Landfall Risk
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Helper: Draw smooth curve ────────────────────────────────────────

function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  points: { lat: number, lon: number }[],
  project: (lat: number, lon: number, w: number, h: number) => [number, number],
  w: number, h: number
) {
  if (points.length < 2) return
  
  const projPts = points.map(p => project(p.lat, p.lon, w, h))
  ctx.beginPath()
  ctx.moveTo(projPts[0][0], projPts[0][1])
  
  for (let i = 0; i < projPts.length - 1; i++) {
    const p1 = projPts[i]
    const p2 = projPts[i + 1]
    const midX = (p1[0] + p2[0]) / 2
    const midY = (p1[1] + p2[1]) / 2
    if (i === 0) {
      ctx.lineTo(midX, midY)
    } else {
      ctx.quadraticCurveTo(p1[0], p1[1], midX, midY)
    }
  }
  ctx.lineTo(projPts[projPts.length - 1][0], projPts[projPts.length - 1][1])
  ctx.stroke()
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

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(10, 20, 35, 0.4)'
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
  dashed: boolean
) {
  if (dashed) {
    ctx.setLineDash([4, 4])
  } else {
    ctx.setLineDash([])
  }

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
    ctx.lineWidth = 1
    ctx.stroke()
  })
  
  ctx.setLineDash([])
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
