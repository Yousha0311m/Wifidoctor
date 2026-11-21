// analytics.ts | SignalFLoor | Room containment, per-room averages & coverage percentage

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