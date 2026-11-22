import type { Room, ScanPoint } from '@/types'
import { CANVAS_W, CANVAS_H } from '@/lib/floor'
import { inRoom } from '@/lib/analytics'

export const CELL = 10

// Same shape the FastAPI/NumPy endpoint will return later
export interface HeatGrid {
  cols: number
  rows: number
  cell: number
  values: (number | null)[] // RSSI per cell, row-major. null = outside every room
}

// Inverse Distance Weighting, power 2:  RSSI(x,y) = Σ(w·rssi) / Σ(w),  w = 1/d²
export function computeHeatGrid(rooms: Room[], points: ScanPoint[]): HeatGrid | null {
  if (rooms.length === 0 || points.length === 0) return null

  const cols = CANVAS_W / CELL
  const rows = CANVAS_H / CELL
  const values: (number | null)[] = new Array(cols * rows).fill(null)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * CELL + CELL / 2
      const cy = row * CELL + CELL / 2
      if (!rooms.some(r => inRoom({ x: cx, y: cy }, r))) continue

      let num = 0
      let den = 0
      let exact: number | null = null
      for (const p of points) {
        const dx = cx - p.x
        const dy = cy - p.y
        const d2 = dx * dx + dy * dy
        if (d2 < 1) { exact = p.rssi; break } // sitting on a measured point
        const w = 1 / d2
        num += w * p.rssi
        den += w
      }
      values[row * cols + col] = exact ?? num / den
    }
  }
  return { cols, rows, cell: CELL, values }
}

export function valueAt(grid: HeatGrid, x: number, y: number): number | null {
  const col = Math.floor(x / grid.cell)
  const row = Math.floor(y / grid.cell)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  return grid.values[row * grid.cols + col]
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

// red at -75 (the dead-zone line) → amber at -67 → green at -50, smooth in between
function ramp(rssi: number, weak: RGB, fair: RGB, strong: RGB): RGB {
  if (rssi <= -75) return weak
  if (rssi <= -67) return mix(weak, fair, (rssi + 75) / 8)
  if (rssi <= -50) return mix(fair, strong, (rssi + 67) / 17)
  return strong
}

// Paints the 100x60 grid into a tiny offscreen canvas. Konva then stretches it
// to 1000x600 and the browser's smoothing makes it look continuous.
export function renderHeatCanvas(
  grid: HeatGrid,
  colors: { weak: string; fair: string; strong: string },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = grid.cols
  canvas.height = grid.rows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(grid.cols, grid.rows)

  const weak = hexToRgb(colors.weak)
  const fair = hexToRgb(colors.fair)
  const strong = hexToRgb(colors.strong)

  grid.values.forEach((v, i) => {
    const o = i * 4
    if (v === null) { img.data[o + 3] = 0; return }
    const [r, g, b] = ramp(v, weak, fair, strong)
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = 255
  })

  ctx.putImageData(img, 0, 0)
  return canvas
}