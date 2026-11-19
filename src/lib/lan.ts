// lan.ts | SignalFLoor | LAN Host info, real Windows netsh Wi-Fi bridge & PC-Phone state synchronization

import type { OperatorTelemetry, Room, ScanPoint } from '@/types'

export interface LanWifiInfo {
  connected: boolean
  ssid: string | null
  bssid: string | null
  signalPct: number | null
  rssi: number | null
  channel: string | null
  radioType: string | null
  rxRateMbps: number | null
  txRateMbps: number | null
  interfaceName: string | null
  source: 'netsh-wlan' | 'unavailable'
}

export interface LanClientInfo {
  id: string
  role: string
  deviceName: string
  lastSeen: number
}

export interface LanInfoResponse {
  hostname: string
  port: number
  urls: string[]
  wifi: LanWifiInfo
  revision: number
  clients: LanClientInfo[]
}

export interface LanSharedState {
  revision: number
  updatedAt: string
  rooms: Room[] | null
  points: ScanPoint[] | null
  routerPos: { x: number; y: number } | null
  operator: OperatorTelemetry | null
  clients: LanClientInfo[]
  latestEspReading?: {
    rssi: number
    minRssi?: number
    maxRssi?: number
    samples?: number
    freeHeap?: number
    ssid: string
    bssid: string
    timestamp: number
  } | null
}

const OPERATOR_KEY = 'signalfloor.operator.v1'
export const OPERATOR_EVENT = 'signalfloor:operator'
const CLIENT_ID_KEY = 'signalfloor.lan.clientId'

export function getLanClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const id = `dev-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(CLIENT_ID_KEY, id)
    return id
  } catch {
    return 'dev-browser'
  }
}

export function detectDeviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone/i.test(ua)) return 'iPhone Companion'
  if (/iPad/i.test(ua)) return 'iPad Companion'
  if (/Android/i.test(ua)) return 'Android Companion'
  return 'Desktop Studio'
}

export function defaultOperator(): OperatorTelemetry {
  return {
    x: 160,
    y: 160,
    heading: 90,
    stepCount: 0,
    strideMeters: 0.75,
    autoCapture: true,
    deviceName: detectDeviceLabel(),
    updatedAt: new Date().toISOString(),
  }
}

export function loadOperator(): OperatorTelemetry {
  try {
    const raw = localStorage.getItem(OPERATOR_KEY)
    if (!raw) return defaultOperator()
    return { ...defaultOperator(), ...(JSON.parse(raw) as Partial<OperatorTelemetry>) }
  } catch {
    return defaultOperator()
  }
}

export function saveOperator(op: OperatorTelemetry): void {
  try {
    localStorage.setItem(OPERATOR_KEY, JSON.stringify(op))
  } catch {
    // ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent(OPERATOR_EVENT, { detail: op }))
}

export async function fetchLanInfo(): Promise<LanInfoResponse | null> {
  try {
    const res = await fetch('/api/lan/info', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as LanInfoResponse
  } catch {
    return null
  }
}

export async function fetchLanState(): Promise<LanSharedState | null> {
  try {
    const res = await fetch('/api/lan/state', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as LanSharedState
  } catch {
    return null
  }
}

export async function pushLanState(patch: {
  rooms?: Room[]
  points?: ScanPoint[]
  routerPos?: { x: number; y: number } | null
  operator?: OperatorTelemetry | null
  role?: 'desktop' | 'companion'
}): Promise<LanSharedState | null> {
  try {
    const res = await fetch('/api/lan/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getLanClientId(),
        deviceName: detectDeviceLabel(),
        role: patch.role ?? (typeof window !== 'undefined' && window.location.search.includes('companion=1') ? 'companion' : 'desktop'),
        ...(patch.rooms !== undefined ? { rooms: patch.rooms } : {}),
        ...(patch.points !== undefined ? { points: patch.points } : {}),
        ...(patch.routerPos !== undefined ? { routerPos: patch.routerPos } : {}),
        ...(patch.operator !== undefined ? { operator: patch.operator } : {}),
      }),
    })
    if (!res.ok) return null
    return (await res.json()) as LanSharedState
  } catch {
    return null
  }
}

export async function scanHostWifi(): Promise<LanWifiInfo | null> {
  try {
    const res = await fetch('/api/lan/wifi-scan', { method: 'POST', cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as LanWifiInfo
  } catch {
    return null
  }
}
