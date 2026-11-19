// Utilities.tsx | SignalFLoor | Wi-Fi ping, latency, jitter, speed benchmark, host uptime & least-traffic channel advisor

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clock,
  Gauge,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Wifi,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import StatCard from '@/components/dashboard/StatCard'
import { Badge, Button, GlassCard, Switch } from '@/components/ui/Kit'
import { useScan } from '@/hooks/useScan'
import {
  estimateSnrMetrics,
  fetchNetDiag,
  formatUptime,
  runLiveSpeedTest,
  type NetDiagResponse,
  type SpeedTestResult,
} from '@/lib/nettools'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'

interface PingHistoryRow {
  sample: string
  gatewayMs: number
  wanMs: number
  jitterMs: number
}

const CHART_AXIS = {
  stroke: 'var(--edge)',
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false as const,
}

const CHART_TIP = {
  contentStyle: {
    background: 'var(--glass-solid)',
    border: '1px solid var(--edge-strong)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text-3)' },
  itemStyle: { color: 'var(--text)' },
}

export default function Utilities() {
  const { points } = useScan()

  const [diag, setDiag] = useState<NetDiagResponse | null>(null)
  const [loadingDiag, setLoadingDiag] = useState(false)
  const [autoPing, setAutoPing] = useState(false)
  const [pingHistory, setPingHistory] = useState<PingHistoryRow[]>([])

  const [speedRunning, setSpeedRunning] = useState(false)
  const [speedPhase, setSpeedPhase] = useState('')
  const [speedPct, setSpeedPct] = useState(0)
  const [speedResult, setSpeedResult] = useState<SpeedTestResult | null>(null)

  const avgScanRssi = points.length
    ? Math.round(points.reduce((s, p) => s + p.rssi, 0) / points.length)
    : -62
  const [snrRssi, setSnrRssi] = useState<number>(avgScanRssi)

  const loadDiag = useCallback(async (quiet = false) => {
    setLoadingDiag(true)
    try {
      const res = await fetchNetDiag()
      if (!res) {
        if (!quiet) toast('Host diagnostic API unavailable — launch via start.bat for live OS ping/netsh.', 'warn')
        return
      }
      setDiag(res)
      const timeLabel = new Date(res.timestamp).toTimeString().slice(0, 8)
      setPingHistory(prev => [
        ...prev.slice(-17),
        {
          sample: timeLabel,
          gatewayMs: res.gatewayPing.avgMs ?? 0,
          wanMs: res.wanPing.avgMs ?? 0,
          jitterMs: res.wanPing.jitterMs ?? res.gatewayPing.jitterMs ?? 0,
        },
      ])
    } finally {
      setLoadingDiag(false)
    }
  }, [])

  useEffect(() => {
    const t0 = setTimeout(() => void loadDiag(true), 20)
    return () => clearTimeout(t0)
  }, [loadDiag])

  useEffect(() => {
    if (!autoPing) return
    const timer = setInterval(() => void loadDiag(true), 3000)
    return () => clearInterval(timer)
  }, [autoPing, loadDiag])

  const startSpeedTest = async () => {
    if (speedRunning) return
    setSpeedRunning(true)
    setSpeedPct(5)
    sound.scan()
    try {
      const res = await runLiveSpeedTest((phase, pct) => {
        setSpeedPhase(phase)
        setSpeedPct(pct)
      })
      setSpeedResult(res)
      sound.success()
      toast(`Speed test complete: ${res.downMbps} Mbps down / ${res.upMbps} Mbps up (${res.httpPingMs} ms).`, 'success')
    } catch {
      toast('Speed test failed — verify Vite LAN server is running.', 'warn')
    } finally {
      setSpeedRunning(false)
    }
  }

  const channelData = useMemo(() => {
    if (!diag) return []
    return diag.channels24
  }, [diag])

  const snr = useMemo(() => estimateSnrMetrics(snrRssi), [snrRssi])

  const gwPingVal = diag?.gatewayPing.avgMs
  const wanPingVal = diag?.wanPing.avgMs
  const linkSpeed = diag?.wifi.rxRateMbps ?? diag?.wifi.txRateMbps ?? null
  const bestChLabel = diag ? `Cleanest: 2.4 GHz Channel ${diag.best24Channel}` : '--'
  const currentCh = diag?.wifi.channel ? parseInt(diag.wifi.channel, 10) : null
  const activeBestCh = diag?.best24Channel ?? null
  const activeCurCongestion = channelData.find(c => c.isCurrent)?.congestionPct ?? null
  const activeBestCongestion = channelData.find(c => c.isBest)?.congestionPct ?? null

  const pingTone =
    wanPingVal === null || wanPingVal === undefined
      ? 'neutral'
      : wanPingVal <= 28
        ? 'strong'
        : wanPingVal <= 65
          ? 'fair'
          : 'weak'

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Wi-Fi Utilities &amp; Spectrum Advisor</h1>
          <p>Live latency, gateway/WAN ping, throughput speed test, host uptime &amp; least-traffic channel finder.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-[var(--text-2)] chip">
            <span>Auto-Ping (3s)</span>
            <Switch checked={autoPing} onChange={setAutoPing} label="Toggle continuous 3-second ping monitor" />
          </label>
          <Button size="sm" disabled={loadingDiag} onClick={() => void loadDiag(false)}>
            <RefreshCw size={13} className={loadingDiag ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button size="sm" variant="primary" disabled={speedRunning} onClick={() => void startSpeedTest()}>
            <Gauge size={14} /> {speedRunning ? 'Testing Speed…' : 'Run Speed Test'}
          </Button>
        </div>
      </div>

      {/* 4 Live Network KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="WAN / Gateway Ping"
          value={wanPingVal ?? gwPingVal ?? '--'}
          unit={wanPingVal !== null || gwPingVal !== null ? 'ms' : undefined}
          tone={pingTone}
          sub={
            diag
              ? `Router (${diag.gatewayIp}): ${gwPingVal ?? '--'} ms · Loss ${diag.wanPing.lossPct}%`
              : 'Measuring latency...'
          }
          icon={<Activity size={16} />}
        />
        <StatCard
          label={speedResult ? 'Measured Speed' : 'Wi-Fi PHY Link'}
          value={speedResult ? speedResult.downMbps : linkSpeed ?? '--'}
          unit={speedResult || linkSpeed ? 'Mbps' : undefined}
          tone={speedResult ? (speedResult.downMbps >= 100 ? 'strong' : 'fair') : linkSpeed ? 'strong' : 'neutral'}
          sub={
            speedResult
              ? `Up: ${speedResult.upMbps} Mbps · Jitter ${speedResult.httpJitterMs} ms`
              : diag?.wifi.txRateMbps
                ? `Tx: ${diag.wifi.txRateMbps} Mbps · ${diag.wifi.radioType ?? '802.11'}`
                : 'Run Speed Test for live rate'
          }
          icon={<Zap size={16} />}
        />
        <StatCard
          label="Least-Traffic Channels"
          value={diag ? `Ch ${diag.best24Channel} / ${diag.best5Channel}` : '--'}
          tone="strong"
          sub={currentCh ? `Active AP is on Channel ${currentCh}` : 'Optimal 2.4G / 5G picks'}
          icon={<Radio size={16} />}
        />
        <StatCard
          label="Host System Uptime"
          value={diag ? formatUptime(diag.hostUptimeSec) : '--'}
          tone="neutral"
          sub={
            diag
              ? `Studio session: ${formatUptime(diag.sessionUptimeSec)}`
              : 'Waiting for host metrics'
          }
          icon={<Clock size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-3.5 items-start">
        {/* Least-Traffic Channel Advisor */}
        <GlassCard
          eyebrow="Spectrum Congestion"
          title="2.4 GHz Channel Advisor"
          sub={bestChLabel}
          icon={<Radio size={17} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
            <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex items-center justify-between">
              <div>
                <p className="eyebrow">Cleanest 2.4 GHz Channel</p>
                <p className="text-xl font-bold font-mono text-[var(--ok-text)]">
                  Channel {activeBestCh ?? '--'}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  Congestion load: {activeBestCongestion ?? 0}% (non-overlapping Ch 1, 6, 11)
                </p>
              </div>
              <Badge tone="strong">Best Pick</Badge>
            </div>

            <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex items-center justify-between">
              <div>
                <p className="eyebrow">Current Active Channel</p>
                <p className="text-xl font-bold font-mono text-[var(--text)]">
                  {currentCh ? `Channel ${currentCh}` : 'Not Connected'}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  {activeCurCongestion !== null
                    ? `Current channel load: ${activeCurCongestion}%`
                    : diag?.wifi.ssid
                      ? `SSID: ${diag.wifi.ssid}`
                      : 'Switch router channel in admin panel'}
                </p>
              </div>
              {currentCh && activeBestCh && currentCh !== activeBestCh && activeCurCongestion !== null && activeBestCongestion !== null && activeCurCongestion > activeBestCongestion ? (
                <Badge tone="warn">Switch to Ch {activeBestCh}</Badge>
              ) : (
                <Badge tone="neutral">2.4 GHz</Badge>
              )}
            </div>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--edge)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...CHART_AXIS} />
                <YAxis domain={[0, 100]} unit="%" {...CHART_AXIS} />
                <Tooltip
                  {...CHART_TIP}
                  formatter={(v, _name, item) => {
                    const row = item?.payload as { directCount?: number; overlapCount?: number } | undefined
                    return [`${v}% load (${row?.directCount ?? 0} direct, ${row?.overlapCount ?? 0} overlap)`, 'Congestion']
                  }}
                />
                <Bar dataKey="congestionPct" radius={[6, 6, 0, 0]}>
                  {channelData.map(entry => (
                    <Cell
                      key={entry.channel}
                      fill={
                        entry.isBest
                          ? 'var(--strong)'
                          : entry.isCurrent
                            ? 'var(--accent-2)'
                            : entry.congestionPct >= 55
                              ? 'var(--weak)'
                              : 'var(--fair)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[11px] text-[var(--text-3)] mt-2">
            Green bar = cleanest recommended channel (evaluated strictly across non-overlapping Ch 1, 6, and 11 for zero bleed). Cyan bar = your active Wi-Fi channel.
          </p>
        </GlassCard>

        {/* Speed Test & Readiness Card */}
        <GlassCard
          eyebrow="Bandwidth & Jitter"
          title="LAN / Wi-Fi Speed & Quality Benchmark"
          icon={<Gauge size={17} />}
        >
          {speedRunning && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-[var(--text-2)] mb-1">
                <span>{speedPhase}</span>
                <span className="font-mono">{speedPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${speedPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="p-2.5 rounded-xl bg-black/25 border border-[var(--edge)]">
              <p className="eyebrow">Download</p>
              <p className="text-lg font-bold font-mono text-[var(--text)]">
                {speedResult ? `${speedResult.downMbps}` : '--'}{' '}
                <span className="text-[11px] font-normal text-[var(--text-3)]">Mbps</span>
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-black/25 border border-[var(--edge)]">
              <p className="eyebrow">Upload</p>
              <p className="text-lg font-bold font-mono text-[var(--text)]">
                {speedResult ? `${speedResult.upMbps}` : '--'}{' '}
                <span className="text-[11px] font-normal text-[var(--text-3)]">Mbps</span>
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-black/25 border border-[var(--edge)]">
              <p className="eyebrow">HTTP Ping</p>
              <p className="text-lg font-bold font-mono text-[var(--text)]">
                {speedResult ? `${speedResult.httpPingMs}` : diag?.gatewayPing.avgMs ?? '--'}{' '}
                <span className="text-[11px] font-normal text-[var(--text-3)]">ms</span>
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-black/25 border border-[var(--edge)]">
              <p className="eyebrow">Jitter</p>
              <p className="text-lg font-bold font-mono text-[var(--text)]">
                {speedResult ? `${speedResult.httpJitterMs}` : diag?.wanPing.jitterMs ?? '--'}{' '}
                <span className="text-[11px] font-normal text-[var(--text-3)]">ms</span>
              </p>
            </div>
          </div>

          {/* Live Ping & Jitter Timeline */}
          <p className="eyebrow mb-1.5">Latency History (Router vs WAN 1.1.1.1)</p>
          <div className="h-[145px] w-full mb-3">
            {pingHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--text-3)] border border-dashed border-[var(--edge)] rounded-xl">
                Collecting ICMP ping telemetry...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pingHistory} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--edge)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="sample" {...CHART_AXIS} />
                  <YAxis unit="ms" {...CHART_AXIS} />
                  <Tooltip {...CHART_TIP} />
                  <Line type="monotone" dataKey="gatewayMs" name="Router ms" stroke="var(--strong)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="wanMs" name="WAN 1.1.1.1 ms" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Interactive SNR & PHY Throughput Estimator */}
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)]">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                <Sliders size={13} /> SNR &amp; Workload Readiness Estimator
              </div>
              <span className="font-mono text-xs text-[var(--accent)]">
                {snrRssi} dBm · SNR {snr.snrDb} dB · MCS {snr.mcsIndex}
              </span>
            </div>
            <input
              type="range"
              min={-90}
              max={-35}
              value={snrRssi}
              onChange={e => setSnrRssi(parseInt(e.target.value, 10))}
              className="w-full mb-2"
            />
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-mono text-[var(--text-2)]">
                Est. PHY {snr.estPhyMbps} Mbps · Real TCP ~{snr.estTcpMbps} Mbps
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge tone={snr.gamingReady ? 'strong' : 'weak'}>Gaming</Badge>
                <Badge tone={snr.streaming4kReady ? 'strong' : 'fair'}>4K Stream</Badge>
                <Badge tone={snr.voiceReady ? 'strong' : 'weak'}>VoIP / Calls</Badge>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Nearby Access Points & Channel Occupancy Table */}
      <GlassCard
        eyebrow="RF Environment"
        title={`Nearby Access Points & BSSID Occupancy (${diag?.neighbors.length ?? 0})`}
        icon={<Wifi size={17} />}
        action={
          <Badge tone={diag?.neighbors.some(n => !n.simulated) ? 'ok' : 'neutral'}>
            <ShieldCheck size={12} className="mr-1" />
            {diag?.neighbors.filter(n => !n.simulated).length ?? 0} Live OS BSSID(s)
          </Badge>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--edge)] text-[var(--text-3)] font-mono">
                <th className="py-2 pr-3">SSID</th>
                <th className="py-2 pr-3">BSSID</th>
                <th className="py-2 pr-3">Band</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Radio</th>
                <th className="py-2 pr-3">Signal</th>
                <th className="py-2 text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {(diag?.neighbors ?? []).map(n => (
                <tr key={n.bssid} className="border-b border-[var(--edge)]/50 hover:bg-white/5">
                  <td className="py-2 pr-3 font-medium text-[var(--text)]">
                    {n.ssid} {n.isCurrent && <Badge tone="ok" className="ml-1">Connected</Badge>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[var(--text-3)]">{n.bssid}</td>
                  <td className="py-2 pr-3 font-mono text-[var(--text-2)]">{n.band}</td>
                  <td className="py-2 pr-3 font-mono text-[var(--text)]">Ch {n.channel}</td>
                  <td className="py-2 pr-3 font-mono text-[var(--text-3)]">{n.radioType}</td>
                  <td className="py-2 pr-3 font-mono">
                    <span className={n.rssi >= -62 ? 'text-[var(--ok-text)]' : n.rssi >= -74 ? 'text-[var(--warn-text)]' : 'text-[var(--err-text)]'}>
                      {n.rssi} dBm ({n.signalPct}%)
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-3)]">
                    {n.simulated ? 'Sample Model' : 'Live OS (netsh)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  )
}
