// index.ts | SignalFLoor | Shared domain interfaces for rooms and Wi-Fi scans

export interface Room {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

// One network heard during a scan (the ESP32 reports the strongest 15 each time)
export interface NearbyNetwork {
  ssid: string
  bssid: string
  rssi: number
  channel: number
}

export interface ScanPoint {
  id: number
  x: number
  y: number
  rssi: number
  ssid: string
  bssid: string
  timestamp: string // ISO string
  channel?: number
  networks?: NearbyNetwork[]
}

// ---- Monitor mode: the always-on ESP32 reports one sample every minute or so ----
export interface MonitorSample {
  t: number // epoch ms, stamped by the backend on arrival
  rssi: number | null // signal to your own router; null = not connected
  channel: number | null
  ssid: string
  gw_ms: number | null // time to reach the router; null = unreachable
  net_ms: number | null // time to reach the internet; null = unreachable
  dns_ms: number | null // time to look up a name; null = failed
  heap?: number | null
  up?: number | null // board uptime, seconds
  aps?: number | null // networks heard in the last scan
  networks?: NearbyNetwork[] // present on samples that included a neighbour scan
}

export interface MonitorEvent {
  t: number
  event: string // "disconnect" | "reconnect"
  reason?: number | null
  down_s?: number | null
}

export interface MonitorState {
  enabled: boolean
  interval: number
  last_seen: number | null
}
