import type { Room, ScanPoint } from '@/types'
import { inRoom } from '@/lib/analytics'

export const SPOT_SPACING = 200 // px: max distance between scan spots inside a room
export const DONE_RADIUS = 60   // px: a spot counts as scanned if a point is this close

export interface Spot {
  id: string
  roomId: string
  roomName: string
  x: number
  y: number
  done: boolean
}

export function suggestSpots(rooms: Room[], points: ScanPoint[]): Spot[] {
  const spots: Spot[] = []
  for (const room of rooms) {
    const cols = Math.max(1, Math.ceil(room.w / SPOT_SPACING))
    const rows = Math.max(1, Math.ceil(room.h / SPOT_SPACING))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // center of each cell, so spots never sit on a wall
        const x = Math.round(room.x + ((c + 0.5) * room.w) / cols)
        const y = Math.round(room.y + ((r + 0.5) * room.h) / rows)
        const done = points.some(
          p => inRoom(p, room) && Math.hypot(p.x - x, p.y - y) <= DONE_RADIUS,
        )
        spots.push({ id: `${room.id}-${r}-${c}`, roomId: room.id, roomName: room.name, x, y, done })
      }
    }
  }
  return spots
}

// nearest undone spot to where you last scanned (or the first one if you haven't yet)
export function nextSpot(spots: Spot[], from?: { x: number; y: number } | null): Spot | null {
  const todo = spots.filter(s => !s.done)
  if (todo.length === 0) return null
  if (!from) return todo[0]
  return todo.reduce((best, s) =>
    Math.hypot(s.x - from.x, s.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? s : best,
  )
}