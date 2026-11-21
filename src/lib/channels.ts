// channels.ts | SignalFLoor | 2.4 GHz channel congestion scoring and nearby-network aggregation from scan data

import type { NearbyNetwork, ScanPoint } from '@/types'

export const CHANNELS = Array.from({ length: 13 }, (_, i) => i + 1)
// Only these three do not overlap each other on 2.4 GHz
export const CLEAN_CHANNELS = [1, 6, 11]

// How strongly a network on channel N disturbs channel M, by channel distance (0..4)
const OVERLAP = [1, 0.8, 0.55, 0.3, 0.12]

export interface SeenNetwork extends NearbyNetwork {
  seenAt: number // number of scan points that heard this network
}

export interface YourNetwork {
  ssid: string
  channel: number | null
  avgRssi: number
}

export interface ChannelScore {
  channel: number
  load: number // 0..100, higher = more crowded
  networks: number // neighbour networks on exactly this channel
  yours: boolean
  best: boolean
}

// Merge every scan into one list: strongest reading per access point
export function collectNetworks(points: ScanPoint[]): SeenNetwork[] {
  const map = new Map<string, SeenNetwork>()
  for (const p of points) {
    for (const n of p.networks ?? []) {
      const key = (n.bssid || `${n.ssid}:${n.channel}`).toLowerCase()
      const cur = map.get(key)
      if (!cur) map.set(key, { ...n, seenAt: 1 })
      else {
        cur.seenAt += 1
        if (n.rssi > cur.rssi) cur.rssi = n.rssi
      }
    }
  }
  return [...map.values()].sort((a, b) => b.rssi - a.rssi)
}

// "Your" network = the SSID that is the strongest reading most often
export function findYourNetwork(points: ScanPoint[], nets: SeenNetwork[]): YourNetwork | null {
  const counts = new Map<string, number>()
  for (const p of points) if (p.ssid) counts.set(p.ssid, (counts.get(p.ssid) ?? 0) + 1)
  let ssid = ''
  let top = 0
  for (const [s, c] of counts) {
    if (c > top) {
      ssid = s
      top = c
    }
  }
  if (!ssid) return null
  const mine = points.filter(p => p.ssid === ssid)
  const avgRssi = Math.round(mine.reduce((s, p) => s + p.rssi, 0) / mine.length)
  const channel = nets.find(n => n.ssid === ssid)?.channel ?? mine.find(p => p.channel)?.channel ?? null
  return { ssid, channel, avgRssi }
}

export function scoreChannels(nets: SeenNetwork[], yourSsid: string | null): ChannelScore[] {
  // Your own access point does not count against the channel it sits on
  const others = nets.filter(n => !yourSsid || n.ssid !== yourSsid)
  const raw = CHANNELS.map(ch => {
    let sum = 0
    let direct = 0
    for (const n of others) {
      const d = Math.abs(n.channel - ch)
      if (d > 4) continue
      const strength = Math.min(1, Math.max(0.05, (n.rssi + 95) / 55))
      sum += OVERLAP[d] * strength
      if (d === 0) direct += 1
    }
    return { channel: ch, sum, direct }
  })
  const best = CLEAN_CHANNELS.map(c => raw.find(r => r.channel === c)!).reduce((a, b) => (b.sum < a.sum ? b : a))
  const yourChannel = nets.find(n => yourSsid && n.ssid === yourSsid)?.channel ?? null
  return raw.map(r => ({
    channel: r.channel,
    load: Math.min(100, Math.round(r.sum * 28)),
    networks: r.direct,
    yours: r.channel === yourChannel,
    best: r.channel === best.channel,
  }))
}
