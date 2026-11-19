// Thin client for the Phase A backend. No auth, no retries — just the
// minimum to trigger a scan and receive results via WebSocket.

const API_BASE = 'http://localhost:8000'

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