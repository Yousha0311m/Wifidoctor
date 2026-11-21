// Thin client for the backend. No auth, no retries: just enough to trigger a
// scan and receive results via WebSocket.
//
// The backend host follows whatever host served the page, so the dashboard
// also works from a phone (where "localhost" would point at the phone itself).

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

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