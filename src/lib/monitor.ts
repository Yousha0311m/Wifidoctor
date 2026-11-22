// monitor.ts | Wi-Ma | Maths for monitor mode: uptime, latency, channel history, event labels, daily report, demo data

import type { MonitorEvent, MonitorSample } from '@/types'
import { CLEAN_CHANNELS, scoreChannels } from '@/lib/channels'

export const HOUR = 3600_000

export interface Outage {
  start: number
  end: number
  ms: number
  ongoing: boolean
}

export function inRange<T extends { t: number }>(items: T[], hours: number, now: number): T[] {
  const from = now - hours * HOUR
  return items.filter(i => i.t >= from)
}

// A sample counts as "online" when the board reached the internet
const online = (s: MonitorSample) => s.rssi !== null && s.net_ms !== null

export function uptimeStats(samples: MonitorSample[]) {
  if (samples.length === 0) return { pct: null as number | null, outages: [] as Outage[] }
  const sorted = [...samples].sort((a, b) => a.t - b.t)
  const outages: Outage[] = []
  let start: number | null = null
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    if (!online(s)) {
      if (start === null) start = s.t
    } else if (start !== null) {
      outages.push({ start, end: s.t, ms: s.t - start, ongoing: false })
      start = null
    }
  }
  if (start !== null) {
    const last = sorted[sorted.length - 1].t
    outages.push({ start, end: last, ms: Math.max(last - start, 0), ongoing: true })
  }
  const ok = sorted.filter(online).length
  return { pct: Math.round((ok / sorted.length) * 1000) / 10, outages }
}

function avg(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
}
function p95(values: number[]) {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]
}

export function latencyStats(samples: MonitorSample[], key: 'gw_ms' | 'net_ms' | 'dns_ms') {
  const vals = samples.map(s => s[key]).filter((v): v is number => typeof v === 'number')
  return { avg: avg(vals), p95: p95(vals), count: vals.length }
}

export function rssiStats(samples: MonitorSample[]) {
  const vals = samples.map(s => s.rssi).filter((v): v is number => typeof v === 'number')
  if (!vals.length) return { avg: null, min: null, max: null, swing: null as number | null }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
  return { avg: Math.round(mean), min: Math.min(...vals), max: Math.max(...vals), swing: Math.round(sd * 10) / 10 }
}

export interface ChannelPoint {
  t: number
  ch1: number
  ch6: number
  ch11: number
  aps: number
}

// Channel load over time, from every sample that carried a neighbour scan
export function channelHistory(samples: MonitorSample[]): ChannelPoint[] {
  const out: ChannelPoint[] = []
  for (const s of samples) {
    if (!s.networks?.length) continue
    const nets = s.networks
      .filter((n): n is typeof n & { channel: number } => typeof n.channel === 'number')
      .map(n => ({ ...n, seenAt: 1 }))
    const scored = scoreChannels(nets, s.ssid || null)
    const load = (c: number) => scored.find(x => x.channel === c)?.load ?? 0
    out.push({ t: s.t, ch1: load(1), ch6: load(6), ch11: load(11), aps: s.networks.length })
  }
  return out.sort((a, b) => a.t - b.t)
}

// Plain-English meaning of the ESP32 disconnect reason codes people actually hit
export function reasonLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'Unknown'
  const map: Record<number, string> = {
    1: 'Unspecified',
    2: 'Login expired',
    3: 'Router left',
    6: 'Sent from wrong state',
    8: 'Router disconnected us',
    15: 'Security handshake timed out',
    200: 'Lost the router signal',
    201: 'Router not found',
    202: 'Wrong password or login failed',
    203: 'Could not join the router',
    204: 'Security handshake timed out',
    205: 'Connection failed',
  }
  return map[code] ?? `Code ${code}`
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export const fmtClock = (t: number) => new Date(t).toTimeString().slice(0, 5)
export const fmtDateTime = (t: number) => {
  const d = new Date(t)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toTimeString().slice(0, 5)}`
}

// Daily summary written from the numbers, no guessing beyond what the data shows
export function dailyReport(samples: MonitorSample[], events: MonitorEvent[]): string[] {
  if (samples.length < 3) return ['Not enough data yet. Leave the board plugged in near your router and check back in a few hours.']
  const lines: string[] = []

  const up = uptimeStats(samples)
  const drops = events.filter(e => e.event === 'disconnect')
  const rssi = rssiStats(samples)

  const stable = samples.filter(s => s.rssi !== null).length / samples.length
  lines.push(
    `Your Wi-Fi link was up ${Math.round(stable * 100)}% of the time and the internet was reachable ${up.pct ?? 0}% of the time.`,
  )

  if (drops.length === 0) {
    lines.push('No disconnects were recorded.')
  } else {
    const hours = drops.map(d => new Date(d.t).getHours())
    const lo = Math.min(...hours)
    const hi = Math.max(...hours)
    lines.push(
      `${drops.length} disconnect${drops.length === 1 ? '' : 's'} recorded${lo === hi ? ` around ${String(lo).padStart(2, '0')}:00` : `, between ${String(lo).padStart(2, '0')}:00 and ${String(hi + 1).padStart(2, '0')}:00`}.`,
    )
  }

  if (up.outages.length) {
    const longest = up.outages.reduce((a, b) => (b.ms > a.ms ? b : a))
    lines.push(
      `The longest internet outage lasted ${fmtDuration(longest.ms)} (from ${fmtDateTime(longest.start)}). If your router stayed connected during it, the problem is your internet provider, not your Wi-Fi.`,
    )
  }

  if (rssi.avg !== null) {
    lines.push(
      `Signal to your router averaged ${rssi.avg} dBm and moved by about ${rssi.swing} dBm. ${
        (rssi.swing ?? 0) > 6 ? 'That is a lot of movement: look for interference or something moving near the board.' : 'That is steady.'
      }`,
    )
  }

  const gw = latencyStats(samples, 'gw_ms')
  if (gw.avg !== null) {
    lines.push(`Reaching the router took ${gw.avg} ms on average (95% under ${gw.p95} ms).`)
  }

  const hist = channelHistory(samples)
  if (hist.length >= 6) {
    // Busiest hour of the day for your own channel, and which clean channel was best then
    const yourCh = [...samples].reverse().find(s => s.channel)?.channel ?? null
    const byHour = new Map<number, ChannelPoint[]>()
    for (const h of hist) {
      const hr = new Date(h.t).getHours()
      byHour.set(hr, [...(byHour.get(hr) ?? []), h])
    }
    let worstHour = -1
    let worstLoad = -1
    for (const [hr, pts] of byHour) {
      const key = yourCh && CLEAN_CHANNELS.includes(yourCh) ? (`ch${yourCh}` as 'ch1' | 'ch6' | 'ch11') : 'ch6'
      const l = pts.reduce((a, p) => a + p[key], 0) / pts.length
      if (l > worstLoad) {
        worstLoad = l
        worstHour = hr
      }
    }
    if (worstHour >= 0) {
      const pts = byHour.get(worstHour)!
      const best = CLEAN_CHANNELS.map(c => ({
        c,
        l: pts.reduce((a, p) => a + p[`ch${c}` as 'ch1' | 'ch6' | 'ch11'], 0) / pts.length,
      })).reduce((a, b) => (b.l < a.l ? b : a))
      lines.push(
        `Your neighbourhood is busiest around ${String(worstHour).padStart(2, '0')}:00. At that time channel ${best.c} was the quietest of 1, 6 and 11${
          yourCh && yourCh !== best.c ? `; your router is on channel ${yourCh}` : ''
        }.`,
      )
    }
  }

  return lines
}

// ---- Demo data: one day of believable readings so the page can be seen without hardware ----
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeDemoMonitor(now: number): { samples: MonitorSample[]; events: MonitorEvent[] } {
  const rand = rng(7)
  const step = 5 * 60_000
  const count = 24 * 12
  const samples: MonitorSample[] = []
  const events: MonitorEvent[] = []
  const outageAt = Math.floor(count * 0.35) // internet outage, router stays connected
  const dropAt = [Math.floor(count * 0.72), Math.floor(count * 0.76)] // two Wi-Fi drops in the evening
  let downSince: number | null = null

  for (let i = 0; i < count; i++) {
    const t = now - (count - 1 - i) * step
    const hr = new Date(t).getHours() + new Date(t).getMinutes() / 60
    // evening crowd: more networks and heavier load between 18:00 and 23:00
    const evening = Math.exp(-Math.pow((hr - 20.5) / 2.2, 2))
    const wifiDown = dropAt.some(d => i >= d && i < d + 2)
    const netDown = i >= outageAt && i < outageAt + 5
    const base = -54 + Math.round((rand() - 0.5) * 4) - Math.round(evening * 3)

    if (wifiDown && downSince === null) {
      downSince = t
      events.push({ t, event: 'disconnect', reason: 200 })
    }
    if (!wifiDown && downSince !== null) {
      events.push({ t, event: 'reconnect', reason: null, down_s: Math.round((t - downSince) / 1000) })
      downSince = null
    }

    const sample: MonitorSample = {
      t,
      rssi: wifiDown ? null : base,
      channel: 6,
      ssid: 'IQTIDAR79',
      gw_ms: wifiDown ? null : Math.round(3 + rand() * 4 + evening * 9 + (rand() > 0.97 ? 40 : 0)),
      net_ms: wifiDown || netDown ? null : Math.round(22 + rand() * 12 + evening * 35),
      dns_ms: wifiDown || netDown ? null : Math.round(18 + rand() * 20 + evening * 25),
      heap: 215000 - Math.round(rand() * 4000),
      up: 3600 * 30 + i * 300,
      aps: Math.round(8 + evening * 9 + rand() * 2),
    }
    if (i % 3 === 0) {
      // every 15 minutes: a neighbour scan. More networks pile onto channel 6 in the evening.
      const nets = [{ ssid: 'IQTIDAR79', bssid: 'aa:aa:aa:aa:aa:06', rssi: base, channel: 6 }]
      const crowd = 3 + Math.round(evening * 6)
      for (let n = 0; n < crowd; n++) {
        const ch = [6, 6, 11, 1, 6, 11, 9, 6][n % 8]
        nets.push({ ssid: `Neighbour ${n + 1}`, bssid: `bb:bb:bb:bb:${n}:${ch}`, rssi: -62 - Math.round(rand() * 25), channel: ch })
      }
      sample.networks = nets
      sample.aps = nets.length
    }
    samples.push(sample)
  }
  return { samples, events }
}
