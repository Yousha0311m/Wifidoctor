// nettools.ts | SignalFLoor | Client helpers for ping, jitter, speed benchmark, host uptime, SNR & channel advisor

import type { LanWifiInfo } from './lan'

export interface PingStats {
  host: string
  reachable: boolean
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  jitterMs: number | null
  lossPct: number
}

export interface NeighborNetwork {
  ssid: string
  bssid: string
  signalPct: number
  rssi: number
  channel: number
  band: '2.4 GHz' | '5 GHz'
  radioType: string
  isCurrent: boolean
  simulated: boolean
}

export interface ChannelMetric {
  channel: number
  label: string
  band: '2.4 GHz' | '5 GHz'
  directCount: number
  overlapCount: number
  congestionPct: number
  isCurrent: boolean
  isBest: boolean
}

export interface NetDiagResponse {
  timestamp: string
  hostUptimeSec: number
  sessionUptimeSec: number
  gatewayIp: string
  gatewayPing: PingStats
  wanPing: PingStats
  wifi: LanWifiInfo
  neighbors: NeighborNetwork[]
  channels24: ChannelMetric[]
  channels5: ChannelMetric[]
  best24Channel: number
  best5Channel: number
}

export interface SpeedTestResult {
  httpPingMs: number
  httpJitterMs: number
  downMbps: number
  upMbps: number
  timestamp: string
  grade: 'Excellent' | 'Good' | 'Fair' | 'Weak'
}

export function formatUptime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const remS = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${remS}s`
  return `${m}m ${remS}s`
}

export async function fetchNetDiag(): Promise<NetDiagResponse | null> {
  try {
    const res = await fetch('/api/lan/net-diag', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as NetDiagResponse
  } catch {
    return null
  }
}

export async function runLiveSpeedTest(
  onProgress?: (phase: string, pct: number) => void,
): Promise<SpeedTestResult> {
  onProgress?.('Measuring HTTP Latency & Jitter...', 15)
  const samples: number[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    await fetch(`/api/lan/wifi-scan?t=${Date.now()}-${i}`, { cache: 'no-store' })
    samples.push(performance.now() - t0)
  }
  const avgPing = +(samples.reduce((s, x) => s + x, 0) / samples.length).toFixed(1)
  const minPing = Math.min(...samples)
  const maxPing = Math.max(...samples)
  const jitter = +(maxPing - minPing).toFixed(1)

  onProgress?.('Testing Download Throughput (3 MB)...', 48)
  const downBytes = 3 * 1024 * 1024
  const d0 = performance.now()
  const downRes = await fetch(`/api/lan/speed-down?bytes=${downBytes}&t=${Date.now()}`, { cache: 'no-store' })
  await downRes.arrayBuffer()
  const downSec = Math.max(0.005, (performance.now() - d0) / 1000)
  const downMbps = +((downBytes * 8) / (downSec * 1_000_000)).toFixed(1)

  onProgress?.('Testing Upload Throughput (1.5 MB)...', 82)
  const upBytes = 1_572_864
  const payload = new Uint8Array(upBytes)
  const u0 = performance.now()
  await fetch('/api/lan/speed-up', {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  const upSec = Math.max(0.005, (performance.now() - u0) / 1000)
  const upMbps = +((upBytes * 8) / (upSec * 1_000_000)).toFixed(1)

  onProgress?.('Complete', 100)

  const grade: SpeedTestResult['grade'] =
    downMbps >= 150 && jitter <= 12
      ? 'Excellent'
      : downMbps >= 50 && jitter <= 25
        ? 'Good'
        : downMbps >= 15
          ? 'Fair'
          : 'Weak'

  return {
    httpPingMs: avgPing,
    httpJitterMs: jitter,
    downMbps,
    upMbps,
    timestamp: new Date().toISOString(),
    grade,
  }
}

export function estimateSnrMetrics(rssi: number, noiseFloor = -92) {
  const snrDb = Math.max(0, rssi - noiseFloor)
  let mcsIndex = 0
  let estPhyMbps = 14
  if (snrDb >= 40) { mcsIndex = 11; estPhyMbps = 1201 }
  else if (snrDb >= 35) { mcsIndex = 9; estPhyMbps = 866 }
  else if (snrDb >= 30) { mcsIndex = 7; estPhyMbps = 574 }
  else if (snrDb >= 25) { mcsIndex = 5; estPhyMbps = 360 }
  else if (snrDb >= 20) { mcsIndex = 4; estPhyMbps = 240 }
  else if (snrDb >= 14) { mcsIndex = 2; estPhyMbps = 115 }
  else if (snrDb >= 9) { mcsIndex = 1; estPhyMbps = 54 }

  const estTcpMbps = Math.round(estPhyMbps * 0.62)
  return {
    snrDb,
    noiseFloor,
    mcsIndex,
    estPhyMbps,
    estTcpMbps,
    gamingReady: snrDb >= 22,
    streaming4kReady: snrDb >= 20,
    voiceReady: snrDb >= 15,
  }
}
