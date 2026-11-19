import type { Room, ScanPoint } from '@/types'

export const ROOMS: Room[] = [
  { id: 'living',  name: 'Living Room', x: 0,   y: 0,   w: 400, h: 300 },
  { id: 'kitchen', name: 'Kitchen',     x: 400, y: 0,   w: 250, h: 300 },
  { id: 'bedroom', name: 'Bedroom',     x: 650, y: 0,   w: 350, h: 300 },
  { id: 'hall',    name: 'Hall',        x: 0,   y: 300, w: 250, h: 300 },
  { id: 'bath',    name: 'Bath',        x: 250, y: 300, w: 200, h: 300 },
  { id: 'study',   name: 'Study',       x: 450, y: 300, w: 550, h: 300 },
]

const p = (id: number, x: number, y: number, rssi: number, min: number): ScanPoint => ({
  id, x, y, rssi,
  ssid: 'HomeNet',
  bssid: 'A4:2B:B0:11:22:33',
  timestamp: `2026-11-17T09:${String(min).padStart(2, '0')}:00Z`,
})

export const POINTS: ScanPoint[] = [
  p(1, 100, 80, -42, 0),   p(2, 300, 150, -48, 1),  p(3, 200, 250, -55, 2),
  p(4, 500, 100, -52, 3),  p(5, 580, 220, -60, 4),
  p(6, 750, 80, -63, 5),   p(7, 900, 200, -70, 6),
  p(8, 80, 400, -50, 7),   p(9, 150, 520, -58, 8),
  p(10, 320, 450, -82, 9), p(11, 380, 540, -86, 10),
  p(12, 550, 400, -72, 11), p(13, 800, 500, -68, 12),
]