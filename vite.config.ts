// vite.config.ts | SignalFLoor | Vite config with LAN host, PC-Phone sync, netsh BSSID channel scan, ping & speed test API

import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

interface LanWifiReading {
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

interface PingStats {
  host: string
  reachable: boolean
  avgMs: number | null
  minMs: number | null
  maxMs: number | null
  jitterMs: number | null
  lossPct: number
}

interface NeighborBssid {
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

interface ChannelScore {
  channel: number
  label: string
  band: '2.4 GHz' | '5 GHz'
  directCount: number
  overlapCount: number
  congestionPct: number
  isCurrent: boolean
  isBest: boolean
}

interface LanClientInfo {
  id: string
  role: string
  deviceName: string
  lastSeen: number
}

interface SharedLanState {
  revision: number
  updatedAt: string
  rooms: unknown[] | null
  points: unknown[] | null
  routerPos: { x: number; y: number } | null
  operator: Record<string, unknown> | null
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

const SPEED_BLOCK = Buffer.alloc(65536)
for (let i = 0; i < SPEED_BLOCK.length; i++) {
  SPEED_BLOCK[i] = (i * 131 + 17) & 0xff
}

function getLanUrls(port: number): string[] {
  const ifaces = os.networkInterfaces()
  const urls: string[] = []
  const priority = (ip: string) => {
    if (ip.startsWith('192.168.')) return 0
    if (ip.startsWith('10.')) return 1
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2
    return 3
  }
  const ips: string[] = []
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address)
      }
    }
  }
  ips.sort((a, b) => priority(a) - priority(b))
  for (const ip of ips) {
    urls.push(`http://${ip}:${port}`)
  }
  return urls
}

function readWindowsWifi(): Promise<LanWifiReading> {
  const empty: LanWifiReading = {
    connected: false,
    ssid: null,
    bssid: null,
    signalPct: null,
    rssi: null,
    channel: null,
    radioType: null,
    rxRateMbps: null,
    txRateMbps: null,
    interfaceName: null,
    source: 'unavailable',
  }

  if (process.platform !== 'win32') return Promise.resolve(empty)

  return new Promise(resolve => {
    execFile('netsh', ['wlan', 'show', 'interfaces'], { timeout: 2200 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(empty)
        return
      }
      const matchField = (re: RegExp) => stdout.match(re)?.[1]?.trim() ?? null
      const state = matchField(/^\s*State\s*:\s*(.+)$/im)?.toLowerCase() ?? ''
      const connected = state.includes('connected') && !state.includes('disconnected')
      const ssid = matchField(/^\s*SSID\s*:\s*(.+)$/im)
      const bssid = matchField(/^\s*(?:AP\s+)?BSSID\s*:\s*(.+)$/im)
      const sigRaw = matchField(/^\s*Signal\s*:\s*(\d+)\s*%/im)
      const signalPct = sigRaw ? Number(sigRaw) : null
      const rssi = signalPct !== null ? Math.max(-95, Math.min(-25, Math.round(signalPct / 2 - 100))) : null
      const channel = matchField(/^\s*Channel\s*:\s*(.+)$/im)
      const radioType = matchField(/^\s*Radio type\s*:\s*(.+)$/im)
      const rxRaw = matchField(/^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)/im)
      const txRaw = matchField(/^\s*Transmit rate \(Mbps\)\s*:\s*([\d.]+)/im)
      const interfaceName = matchField(/^\s*Name\s*:\s*(.+)$/im)

      resolve({
        connected: connected && signalPct !== null,
        ssid: ssid || null,
        bssid: bssid || null,
        signalPct,
        rssi,
        channel,
        radioType,
        rxRateMbps: rxRaw ? Number(rxRaw) : null,
        txRateMbps: txRaw ? Number(txRaw) : null,
        interfaceName,
        source: connected && signalPct !== null ? 'netsh-wlan' : 'unavailable',
      })
    })
  })
}

function detectDefaultGateway(): Promise<string> {
  if (process.platform !== 'win32') return Promise.resolve('192.168.1.1')
  return new Promise(resolve => {
    execFile('ipconfig', [], { timeout: 1500 }, (_err, stdout) => {
      const text = stdout || ''
      const matches = text.matchAll(/Default Gateway[^:\r\n]*:\s*(\d{1,3}(?:\.\d{1,3}){3})/gi)
      for (const m of matches) {
        if (m[1] && m[1] !== '0.0.0.0') {
          resolve(m[1])
          return
        }
      }
      resolve('192.168.1.1')
    })
  })
}

function runWindowsPing(host: string, count = 2): Promise<PingStats> {
  if (process.platform !== 'win32') {
    return Promise.resolve({
      host,
      reachable: false,
      avgMs: null,
      minMs: null,
      maxMs: null,
      jitterMs: null,
      lossPct: 100,
    })
  }

  return new Promise(resolve => {
    execFile('ping', ['-n', String(count), '-w', '800', host], { timeout: 2200 }, (_err, stdout) => {
      const out = (stdout || '').replace(/<\s*1ms/gi, '1ms')
      const lossMatch = out.match(/\((\d+)%\s+loss\)/i)
      const lossPct = lossMatch ? Number(lossMatch[1]) : 100
      const statsMatch = out.match(/Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms/i)
      if (!statsMatch) {
        resolve({
          host,
          reachable: false,
          avgMs: null,
          minMs: null,
          maxMs: null,
          jitterMs: null,
          lossPct,
        })
        return
      }
      const minMs = Number(statsMatch[1])
      const maxMs = Number(statsMatch[2])
      const avgMs = Number(statsMatch[3])
      resolve({
        host,
        reachable: lossPct < 100,
        avgMs,
        minMs,
        maxMs,
        jitterMs: Math.max(0, maxMs - minMs),
        lossPct,
      })
    })
  })
}

function buildChannelAnalysis(neighbors: NeighborBssid[], currentChannel: number | null) {
  const ch24List = Array.from({ length: 11 }, (_, i) => i + 1)
  const rawScores24 = ch24List.map(ch => {
    let score = 0
    let directCount = 0
    let overlapCount = 0
    for (const n of neighbors) {
      if (n.band !== '2.4 GHz') continue
      const diff = Math.abs(n.channel - ch)
      if (diff === 0) directCount += 1
      else if (diff <= 3) overlapCount += 1
      if (diff <= 4) {
        const w = (1 - diff * 0.2) * (Math.max(15, n.signalPct) / 100) * (n.isCurrent ? 0.55 : 1)
        score += w
      }
    }
    return {
      channel: ch,
      score,
      directCount,
      overlapCount,
      congestionPct: Math.min(100, Math.round(score * 36)),
    }
  })

  const nonOverlapping24 = rawScores24.filter(c => c.channel === 1 || c.channel === 6 || c.channel === 11)
  const best24 = nonOverlapping24.reduce((best, cur) => (cur.score < best.score ? cur : best), nonOverlapping24[0]).channel

  const channels24: ChannelScore[] = rawScores24.map(c => ({
    channel: c.channel,
    label: `Ch ${c.channel}`,
    band: '2.4 GHz',
    directCount: c.directCount,
    overlapCount: c.overlapCount,
    congestionPct: c.congestionPct,
    isCurrent: currentChannel === c.channel,
    isBest: c.channel === best24,
  }))

  const base5 = [36, 40, 44, 48, 149, 153, 157, 161, 165]
  const extra5 = neighbors.filter(n => n.band === '5 GHz' && !base5.includes(n.channel)).map(n => n.channel)
  const ch5List = Array.from(new Set([...base5, ...extra5])).sort((a, b) => a - b)

  const rawScores5 = ch5List.map(ch => {
    let score = 0
    let directCount = 0
    let overlapCount = 0
    for (const n of neighbors) {
      if (n.band !== '5 GHz') continue
      if (n.channel === ch) {
        directCount += 1
        score += (Math.max(15, n.signalPct) / 100) * (n.isCurrent ? 0.5 : 1)
      } else if (Math.abs(n.channel - ch) === 4) {
        overlapCount += 1
        score += 0.12
      }
    }
    return {
      channel: ch,
      score,
      directCount,
      overlapCount,
      congestionPct: Math.min(100, Math.round(score * 42)),
    }
  })

  const best5 = rawScores5.reduce((best, cur) => (cur.score < best.score ? cur : best), rawScores5[0]).channel

  const channels5: ChannelScore[] = rawScores5.map(c => ({
    channel: c.channel,
    label: `Ch ${c.channel}`,
    band: '5 GHz',
    directCount: c.directCount,
    overlapCount: c.overlapCount,
    congestionPct: c.congestionPct,
    isCurrent: currentChannel === c.channel,
    isBest: c.channel === best5,
  }))

  return { channels24, channels5, best24Channel: best24, best5Channel: best5 }
}

function scanNeighborNetworks(activeWifi: LanWifiReading): Promise<{
  neighbors: NeighborBssid[]
  channels24: ChannelScore[]
  channels5: ChannelScore[]
  best24Channel: number
  best5Channel: number
}> {
  const curCh = activeWifi.channel ? parseInt(activeWifi.channel, 10) : null
  const curBssid = activeWifi.bssid?.toLowerCase() ?? ''

  const finalize = (rawList: NeighborBssid[]) => {
    const list = [...rawList]
    if (activeWifi.connected && activeWifi.ssid && curCh && !list.some(n => n.isCurrent)) {
      list.unshift({
        ssid: activeWifi.ssid,
        bssid: activeWifi.bssid ?? '00:00:00:00:00:00',
        signalPct: activeWifi.signalPct ?? 80,
        rssi: activeWifi.rssi ?? -60,
        channel: curCh,
        band: curCh > 14 ? '5 GHz' : '2.4 GHz',
        radioType: activeWifi.radioType ?? '802.11ax',
        isCurrent: true,
        simulated: false,
      })
    }

    const activeScanOnly = list.filter(n => !n.simulated).length
    if (activeScanOnly < 2) {
      const sampleNeighbors: NeighborBssid[] = [
        { ssid: 'Neighbor-Mesh-2G', bssid: 'C4:3D:75:21:08:1A', signalPct: 72, rssi: -64, channel: 6, band: '2.4 GHz', radioType: '802.11n', isCurrent: false, simulated: true },
        { ssid: 'ATT-Home-882', bssid: 'D8:47:32:90:44:2B', signalPct: 58, rssi: -71, channel: 6, band: '2.4 GHz', radioType: '802.11n', isCurrent: false, simulated: true },
        { ssid: 'CafeGuest-2.4', bssid: 'A0:63:91:55:19:04', signalPct: 44, rssi: -78, channel: 1, band: '2.4 GHz', radioType: '802.11n', isCurrent: false, simulated: true },
        { ssid: 'Neighbor-Fiber-5G', bssid: 'F4:92:BF:31:77:8C', signalPct: 62, rssi: -69, channel: 36, band: '5 GHz', radioType: '802.11ax', isCurrent: false, simulated: true },
        { ssid: 'SmartTV-Direct', bssid: '70:3A:CB:12:6D:9E', signalPct: 46, rssi: -77, channel: 149, band: '5 GHz', radioType: '802.11ac', isCurrent: false, simulated: true },
      ]
      for (const s of sampleNeighbors) {
        if (!list.some(existing => existing.bssid.toLowerCase() === s.bssid.toLowerCase())) {
          list.push(s)
        }
      }
    }

    const analysis = buildChannelAnalysis(list, curCh)
    return { neighbors: list, ...analysis }
  }

  if (process.platform !== 'win32') return Promise.resolve(finalize([]))

  return new Promise(resolve => {
    execFile('netsh', ['wlan', 'show', 'networks', 'mode=bssid'], { timeout: 2400 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(finalize([]))
        return
      }
      const parsed: NeighborBssid[] = []
      let currentSsid = '(Hidden)'
      let currentItem: NeighborBssid | null = null

      for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim()
        const ssidMatch = line.match(/^SSID\s+\d+\s*:\s*(.*)$/i)
        if (ssidMatch) {
          currentSsid = ssidMatch[1].trim() || '(Hidden Network)'
          currentItem = null
          continue
        }
        const bssidMatch = line.match(/^BSSID\s+\d+\s*:\s*([0-9a-f:]{17})$/i)
        if (bssidMatch) {
          const mac = bssidMatch[1]
          currentItem = {
            ssid: currentSsid,
            bssid: mac,
            signalPct: 50,
            rssi: -75,
            channel: 6,
            band: '2.4 GHz',
            radioType: '802.11n',
            isCurrent: curBssid !== '' && mac.toLowerCase() === curBssid,
            simulated: false,
          }
          parsed.push(currentItem)
          continue
        }
        if (!currentItem) continue

        const sigMatch = line.match(/^Signal\s*:\s*(\d+)\s*%/i)
        if (sigMatch) {
          const pct = Number(sigMatch[1])
          currentItem.signalPct = pct
          currentItem.rssi = Math.max(-95, Math.min(-25, Math.round(pct / 2 - 100)))
          continue
        }
        const chMatch = line.match(/^Channel\s*:\s*(\d+)/i)
        if (chMatch) {
          const ch = Number(chMatch[1])
          currentItem.channel = ch
          currentItem.band = ch > 14 ? '5 GHz' : '2.4 GHz'
          continue
        }
        const radMatch = line.match(/^Radio type\s*:\s*(.+)$/i)
        if (radMatch) {
          currentItem.radioType = radMatch[1].trim()
        }
      }

      resolve(finalize(parsed))
    })
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'))
        return
      }
      raw += chunk.toString('utf8')
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function signalFloorLanBridge(): Plugin {
  const rootDir = import.meta.dirname
  const persistFile = path.join(rootDir, 'node_modules', '.tmp', 'signalfloor-lan-state.json')

  let state: SharedLanState = {
    revision: 0,
    updatedAt: new Date().toISOString(),
    rooms: null,
    points: null,
    routerPos: null,
    operator: null,
  }

  try {
    if (fs.existsSync(persistFile)) {
      const parsed = JSON.parse(fs.readFileSync(persistFile, 'utf8')) as Partial<SharedLanState>
      state = { ...state, ...parsed }
    }
  } catch {
    // start with clean shared state
  }

  const clients = new Map<string, LanClientInfo>()

  const persistState = () => {
    try {
      fs.mkdirSync(path.dirname(persistFile), { recursive: true })
      fs.writeFileSync(persistFile, JSON.stringify(state), 'utf8')
    } catch {
      // ignore disk write issues
    }
  }

  const pruneClients = () => {
    const now = Date.now()
    for (const [id, c] of clients.entries()) {
      if (now - c.lastSeen > 15_000) clients.delete(id)
    }
  }

  return {
    name: 'signalfloor-lan-bridge',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const urlStr = req.url ?? ''
        if (!urlStr.startsWith('/api/lan/')) {
          next()
          return
        }

        const [cleanPath, queryStr = ''] = urlStr.split('?')
        const query = new URLSearchParams(queryStr)
        const addr = server.httpServer?.address()
        const activePort = typeof addr === 'object' && addr ? addr.port : 5173

        if (cleanPath === '/api/lan/info' && req.method === 'GET') {
          pruneClients()
          const wifi = await readWindowsWifi()
          sendJson(res, 200, {
            hostname: os.hostname(),
            port: activePort,
            urls: getLanUrls(activePort),
            wifi,
            revision: state.revision,
            clients: Array.from(clients.values()),
          })
          return
        }

        if (cleanPath === '/api/lan/state' && req.method === 'GET') {
          pruneClients()
          sendJson(res, 200, {
            ...state,
            clients: Array.from(clients.values()),
          })
          return
        }

        if (cleanPath === '/api/lan/state' && req.method === 'POST') {
          try {
            const raw = await readBody(req)
            const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>

            if (typeof body.clientId === 'string' && body.clientId) {
              clients.set(body.clientId, {
                id: body.clientId,
                role: typeof body.role === 'string' ? body.role : 'companion',
                deviceName: typeof body.deviceName === 'string' ? body.deviceName : 'Device',
                lastSeen: Date.now(),
              })
            }

            let mutated = false
            if (Array.isArray(body.rooms)) {
              state.rooms = body.rooms
              mutated = true
            }
            if (Array.isArray(body.points)) {
              state.points = body.points
              mutated = true
            }
            if (body.routerPos !== undefined) {
              state.routerPos = (body.routerPos as { x: number; y: number } | null) ?? null
              mutated = true
            }
            if (body.operator !== undefined) {
              state.operator = (body.operator as Record<string, unknown> | null) ?? null
              mutated = true
            }

            if (mutated) {
              state.revision += 1
              state.updatedAt = new Date().toISOString()
              persistState()
            }

            pruneClients()
            sendJson(res, 200, {
              ...state,
              clients: Array.from(clients.values()),
            })
          } catch (err) {
            sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON payload' })
          }
          return
        }

        if (cleanPath === '/api/lan/esp-scan' && (req.method === 'POST' || req.method === 'GET')) {
          if (req.method === 'POST') {
            try {
              const raw = await readBody(req)
              const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
              const rssi = typeof body.rssi === 'number' ? body.rssi : Number(body.rssi)
              if (!Number.isNaN(rssi)) {
                state.latestEspReading = {
                  rssi,
                  minRssi: typeof body.minRssi === 'number' ? body.minRssi : rssi,
                  maxRssi: typeof body.maxRssi === 'number' ? body.maxRssi : rssi,
                  samples: typeof body.samples === 'number' ? body.samples : 10,
                  freeHeap: typeof body.freeHeap === 'number' ? body.freeHeap : 184000,
                  ssid: typeof body.ssid === 'string' ? body.ssid : '',
                  bssid: typeof body.bssid === 'string' ? body.bssid : '',
                  timestamp: Date.now(),
                }
                state.revision += 1
                state.updatedAt = new Date().toISOString()
                persistState()
                sendJson(res, 200, { ok: true, received: state.latestEspReading })
                return
              }
              sendJson(res, 400, { error: 'Missing or invalid rssi number' })
            } catch (err) {
              sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON' })
            }
            return
          }
          sendJson(res, 200, { ok: true, latest: state.latestEspReading ?? null })
          return
        }

        if (cleanPath === '/api/lan/wifi-scan' && (req.method === 'POST' || req.method === 'GET')) {
          const wifi = await readWindowsWifi()
          sendJson(res, 200, wifi)
          return
        }

        if (cleanPath === '/api/lan/net-diag' && req.method === 'GET') {
          const [wifi, gatewayIp] = await Promise.all([readWindowsWifi(), detectDefaultGateway()])
          const [gatewayPing, wanPing, spectrum] = await Promise.all([
            runWindowsPing(gatewayIp, 2),
            runWindowsPing('1.1.1.1', 2),
            scanNeighborNetworks(wifi),
          ])
          sendJson(res, 200, {
            timestamp: new Date().toISOString(),
            hostUptimeSec: Math.round(os.uptime()),
            sessionUptimeSec: Math.round(process.uptime()),
            gatewayIp,
            gatewayPing,
            wanPing,
            wifi,
            ...spectrum,
          })
          return
        }

        if (cleanPath === '/api/lan/speed-down' && req.method === 'GET') {
          const reqBytes = Number(query.get('bytes') || '3145728')
          const totalBytes = Math.max(65536, Math.min(8 * 1024 * 1024, Number.isFinite(reqBytes) ? reqBytes : 3145728))
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('Content-Length', String(totalBytes))
          res.setHeader('Cache-Control', 'no-store')
          let sent = 0
          while (sent < totalBytes) {
            const chunkLen = Math.min(SPEED_BLOCK.length, totalBytes - sent)
            res.write(chunkLen === SPEED_BLOCK.length ? SPEED_BLOCK : SPEED_BLOCK.subarray(0, chunkLen))
            sent += chunkLen
          }
          res.end()
          return
        }

        if (cleanPath === '/api/lan/speed-up' && req.method === 'POST') {
          const started = performance.now()
          let receivedBytes = 0
          req.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length
          })
          req.on('end', () => {
            sendJson(res, 200, {
              receivedBytes,
              elapsedMs: +(performance.now() - started).toFixed(2),
            })
          })
          return
        }

        sendJson(res, 404, { error: 'Unknown LAN endpoint' })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), signalFloorLanBridge()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    host: true,
    port: 5173,
  },
})
