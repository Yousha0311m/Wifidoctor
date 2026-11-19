export const CANVAS_W = 1000
export const CANVAS_H = 600
export const GRID = 10
export const MIN_ROOM = 40

export const snap = (v: number) => Math.round(v / GRID) * GRID
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))