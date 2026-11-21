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
