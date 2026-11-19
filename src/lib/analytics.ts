// analytics.ts | SignalFLoor | Spatial room stats, coverage percentage & line-of-sight wall/distance ruler math

import type { Room, ScanPoint } from '@/types'

export const inRoom = (p: { x: number; y: number }, r: Room) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h

export function roomAverages(rooms: Room[], points: ScanPoint[]) {
  return rooms
    .map(room => {
      const pts = points.filter(p => inRoom(p, room))
      if (!pts.length) return null
      const avg = pts.reduce((s, p) => s + p.rssi, 0) / pts.length
      return { room, avg: Math.round(avg), count: pts.length }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

export function coveragePct(points: ScanPoint[]) {
  if (!points.length) return 0
  return Math.round((points.filter(p => p.rssi > -67).length / points.length) * 100)
}

function intersectionPoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { x: number; y: number } | null {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(denom) < 1e-6) return null
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: ax + t * (bx - ax), y: ay + t * (by - ay) }
  }
  return null
}

export function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

export interface SpanMetrics {
  px: number
  meters: number
  dxMeters: number
  dyMeters: number
  steps: number
  bearingDeg: number
  cardinal: string
  wallsCrossed: number
  estLossDb: number
}

export function measureSpan(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rooms: Room[],
  strideMeters = 0.75,
): SpanMetrics {
  const px = Math.hypot(x2 - x1, y2 - y1)
  const meters = +(px / 50).toFixed(2)
  const dxMeters = +(Math.abs(x2 - x1) / 50).toFixed(2)
  const dyMeters = +(Math.abs(y2 - y1) / 50).toFixed(2)
  const steps = px < 10 ? 0 : Math.max(1, Math.round(meters / strideMeters))
  const rawDeg = Math.round((Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI)
  const bearingDeg = ((rawDeg % 360) + 360) % 360
  const cardinal = bearingToCardinal(bearingDeg)

  // Count distinct shared/exterior wall crossings (dedup overlapping shared wall segments)
  const seenEdges = new Set<string>()
  let wallsCrossed = 0

  for (const r of rooms) {
    const edges: [number, number, number, number][] = [
      [r.x, r.y, r.x + r.w, r.y],
      [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h, r.x + r.w, r.y + r.h],
      [r.x, r.y, r.x, r.y + r.h],
    ]
    for (const [ex1, ey1, ex2, ey2] of edges) {
      const hit = intersectionPoint(x1, y1, x2, y2, ex1, ey1, ex2, ey2)
      if (hit) {
        const key = `${Math.round(hit.x / 6)}:${Math.round(hit.y / 6)}`
        if (!seenEdges.has(key)) {
          seenEdges.add(key)
          wallsCrossed += 1
        }
      }
    }
  }

  const distLog = meters > 0.2 ? 30 * Math.log10(Math.max(1, meters)) : 0
  const estLossDb = Math.round(distLog + wallsCrossed * 6.5)

  return {
    px: Math.round(px),
    meters,
    dxMeters,
    dyMeters,
    steps,
    bearingDeg,
    cardinal,
    wallsCrossed,
    estLossDb,
  }
}
