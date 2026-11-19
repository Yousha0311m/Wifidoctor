// workspace.ts | SignalFLoor | Synchronized localStorage helpers for rooms, scans & CSV/JSON exports

import type { Room, ScanPoint } from '@/types'
import { POINTS, ROOMS } from './mock'
import { findDeadZones, recommend } from './recommend'
import { computeHeatGrid } from './heatmap'
import { coveragePct } from './analytics'

export const ROOMS_KEY = 'signalfloor.rooms'
export const POINTS_KEY = 'signalfloor.points'
export const ROOMS_EVENT = 'signalfloor:rooms'
export const POINTS_EVENT = 'signalfloor:points'

export function writeRooms(rooms: Room[]): void {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms)) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(ROOMS_EVENT, { detail: rooms }))
}

export function writePoints(points: ScanPoint[]): void {
  try { localStorage.setItem(POINTS_KEY, JSON.stringify(points)) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(POINTS_EVENT, { detail: points }))
}

export function loadDemoWorkspace(): { rooms: number; points: number } {
  writeRooms(ROOMS)
  writePoints(POINTS)
  return { rooms: ROOMS.length, points: POINTS.length }
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportTelemetryCsv(points: ScanPoint[]): void {
  const header = 'id,timestamp,x,y,rssi,ssid,bssid'
  const rows = points.map(p => `${p.id},"${p.timestamp}",${p.x},${p.y},${p.rssi},"${p.ssid}","${p.bssid}"`)
  downloadTextFile(`signalfloor-scans-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8')
}

export function exportTelemetryJson(rooms: Room[], points: ScanPoint[]): void {
  const heat = computeHeatGrid(rooms, points)
  const zones = findDeadZones(rooms, points)
  const recs = recommend(rooms, zones, points, heat)
  const payload = {
    exportedAt: new Date().toISOString(),
    coveragePct: coveragePct(points),
    rooms,
    points,
    deadZones: zones,
    recommendations: recs.map(r => ({ zoneId: r.zone.id, hostRoom: r.hostRoom, x: r.x, y: r.y, text: r.text })),
  }
  downloadTextFile(`signalfloor-report-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json')
}
