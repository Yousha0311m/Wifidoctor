// scanner.ts | SignalFLoor | RF simulator with customizable router position (used when no ESP32 is connected)

import type { Room } from '@/types'
import { inRoom } from '@/lib/analytics'

const PX_PER_UNIT = 50 // simulator only: canvas pixels per distance unit
const WALL_PENALTY = 8  // dB loss when crossing into another room

export function mockRouter(rooms: Room[]): { x: number; y: number } {
  const r = rooms[0]
  return r ? { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) } : { x: 100, y: 100 }
}

export function getRouterPos(
  rooms: Room[],
  custom?: { x: number; y: number } | null,
): { x: number; y: number } {
  return custom ?? mockRouter(rooms)
}

export async function simulateScan(
  x: number,
  y: number,
  rooms: Room[],
  delay = 550,
  customRouter?: { x: number; y: number } | null,
  ssid = 'HomeNet',
): Promise<{ rssi: number; ssid: string; bssid: string }> {
  if (delay > 0) await new Promise(res => setTimeout(res, delay))

  const router = getRouterPos(rooms, customRouter)
  const dist = Math.max(Math.hypot(x - router.x, y - router.y) / PX_PER_UNIT, 1)

  const routerRoom = rooms.find(r => inRoom(router, r))
  const here = rooms.find(r => inRoom({ x, y }, r))
  const walls = routerRoom && here && routerRoom.id !== here.id ? WALL_PENALTY : 0

  const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 4
  const rssi = Math.round(-40 - 30 * Math.log10(dist) - walls + noise)

  return {
    rssi: Math.max(-95, Math.min(-30, rssi)),
    ssid: ssid || 'HomeNet',
    bssid: 'A4:2B:B0:11:22:33',
  }
}
