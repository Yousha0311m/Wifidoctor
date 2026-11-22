// Thin client for the backend. No auth, no retries: just enough to trigger a
// scan and receive results via WebSocket.
//
// The backend host follows whatever host served the page, so the dashboard
// also works from a phone (where "localhost" would point at the phone itself).

export const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export async function postScan(x: number, y: number): Promise<{ scan_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  })
  if (!res.ok) throw new Error(`POST /scan failed: ${res.status} ${res.statusText}`)
  return res.json()
}

export function wsUrl(): string {
  return API_BASE.replace(/^http/, 'ws') + '/ws'
}

import type { MonitorEvent, MonitorSample, MonitorState } from '@/types'

export interface MonitorPayload {
  samples: MonitorSample[]
  events: MonitorEvent[]
  state: MonitorState
}

export async function getMonitor(hours: number): Promise<MonitorPayload> {
  const res = await fetch(`${API_BASE}/monitor?hours=${hours}`)
  if (!res.ok) throw new Error(`GET /monitor failed: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function setMonitorMode(enabled: boolean, interval: number): Promise<void> {
  const res = await fetch(`${API_BASE}/monitor/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, interval }),
  })
  if (!res.ok) throw new Error(`POST /monitor/mode failed: ${res.status} ${res.statusText}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error)
}

export async function clearMonitor(): Promise<void> {
  await fetch(`${API_BASE}/monitor`, { method: 'DELETE' })
}
