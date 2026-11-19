// index.ts | SignalFLoor | Shared domain interfaces for rooms, Wi-Fi scans, live operator telemetry & distance ruler

export interface Room {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface ScanPoint {
  id: number
  x: number
  y: number
  rssi: number
  ssid: string
  bssid: string
  timestamp: string // ISO string
}

export interface OperatorTelemetry {
  x: number
  y: number
  heading: number // degrees 0..360 (0 = North/Up, 90 = East/Right)
  stepCount: number
  strideMeters: number
  autoCapture: boolean
  deviceName: string
  updatedAt: string
}

export interface RulerMeasurement {
  x1: number
  y1: number
  x2: number
  y2: number
}
