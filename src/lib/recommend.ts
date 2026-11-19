import type { Room, ScanPoint } from '@/types'
import { inRoom } from '@/lib/analytics'
import { valueAt, type HeatGrid } from '@/lib/heatmap'

export const DEAD_RSSI = -75 // below this = dead zone
export const GOOD_RSSI = -67 // at or above this = good enough to anchor an extender
const LINK_DIST = 300        // px: weak points closer than this belong to the same dead zone

export interface DeadZone {
  id: number
  points: ScanPoint[]
  cx: number
  cy: number
  avg: number
  roomName: string
}

export interface Recommendation {
  zone: DeadZone
  x: number
  y: number
  hostRoom: string
  text: string
}

// Weak points that sit near each other form one dead zone. This is DBSCAN with
// minPts = 1, which is the same thing as connected components. The real
// scikit-learn DBSCAN comes with the backend.
export function findDeadZones(rooms: Room[], points: ScanPoint[]): DeadZone[] {
  const weak = points.filter(p => p.rssi < DEAD_RSSI)
  const seen = new Set<number>()
  const found: Omit<DeadZone, 'id'>[] = []

  for (const start of weak) {
    if (seen.has(start.id)) continue
    const cluster: ScanPoint[] = []
    const queue = [start]
    seen.add(start.id)

    while (queue.length) {
      const cur = queue.pop()!
      cluster.push(cur)
      for (const q of weak) {
        if (!seen.has(q.id) && Math.hypot(q.x - cur.x, q.y - cur.y) <= LINK_DIST) {
          seen.add(q.id)
          queue.push(q)
        }
      }
    }

    const names = [
      ...new Set(
        cluster
          .map(p => rooms.find(r => inRoom(p, r))?.name)
          .filter((n): n is string => !!n),
      ),
    ]

    found.push({
      points: cluster,
      cx: Math.round(cluster.reduce((s, p) => s + p.x, 0) / cluster.length),
      cy: Math.round(cluster.reduce((s, p) => s + p.y, 0) / cluster.length),
      avg: Math.round(cluster.reduce((s, p) => s + p.rssi, 0) / cluster.length),
      roomName: names.join(' / ') || 'an unmapped area',
    })
  }

  // worst first
  return found.sort((a, b) => a.avg - b.avg).map((z, i) => ({ ...z, id: i + 1 }))
}

const dTo = (p: { x: number; y: number }, cx: number, cy: number) =>
  Math.hypot(p.x - cx, p.y - cy)

// For each dead zone: start at the closest strong reading, then walk toward the
// dead zone and stop at the last spot where the estimated signal is still good.
// That's the closest place to the dead zone an extender can sit and still get a
// solid link back to the router.
export function recommend(
  rooms: Room[],
  zones: DeadZone[],
  points: ScanPoint[],
  grid: HeatGrid | null,
): Recommendation[] {
  const strong = points.filter(p => p.rssi >= GOOD_RSSI)
  if (strong.length === 0) return []

  return zones.map(zone => {
    const anchor = strong.reduce((b, p) =>
      dTo(p, zone.cx, zone.cy) < dTo(b, zone.cx, zone.cy) ? p : b,
    )

    let best = { x: anchor.x, y: anchor.y }
    const dx = zone.cx - anchor.x
    const dy = zone.cy - anchor.y
    const dist = Math.hypot(dx, dy)
    const steps = Math.floor(dist / 10)

    for (let i = 1; i <= steps; i++) {
      const x = anchor.x + (dx / dist) * i * 10
      const y = anchor.y + (dy / dist) * i * 10
      const v = grid ? valueAt(grid, x, y) : null
      if (v === null || v < GOOD_RSSI) break
      best = { x: Math.round(x), y: Math.round(y) }
    }

    const hostRoom = rooms.find(r => inRoom(best, r))?.name ?? 'the nearest room'
    const sameRoom = zone.roomName.split(' / ').includes(hostRoom)

    const text = sameRoom
      ? `Dead zone in ${zone.roomName} (avg ${zone.avg} dBm). Place an extender in ${hostRoom} at the marked spot, on the side closest to your router.`
      : `Dead zone in ${zone.roomName} (avg ${zone.avg} dBm). Place an extender in ${hostRoom}, toward ${zone.roomName}.`

    return { zone, x: best.x, y: best.y, hostRoom, text }
  })
}