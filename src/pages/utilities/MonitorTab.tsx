// MonitorTab.tsx | Wi-Ma | Always-on monitoring: signal timeline, latency, channel traffic, uptime, connection log, daily report

import { useMemo, useState } from 'react'
import { Activity, Clock, Database, Gauge, Globe, Play, Square, Wifi, WifiOff } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, CartesianGrid, Legend,
} from 'recharts'
import StatCard from '@/components/dashboard/StatCard'
import { Badge, Button, GlassCard, Segmented, type SegOption } from '@/components/ui/Kit'
import { clearMonitorDemo, loadMonitorDemo, useMonitor, useNow } from '@/hooks/useMonitor'
import {
  HOUR, channelHistory, dailyReport, fmtClock, fmtDateTime, fmtDuration, inRange,
  latencyStats, reasonLabel, rssiStats, uptimeStats,
} from '@/lib/monitor'
import { DEAD_RSSI, GOOD_RSSI } from '@/lib/recommend'
import { signalLevel } from '@/lib/signal'
import { toast } from '@/lib/toast'

type Range = '6' | '24' | '168'
const RANGES: SegOption<Range>[] = [
  { value: '6', label: '6 h' },
  { value: '24', label: '24 h' },
  { value: '168', label: '7 d' },
]
const INTERVALS = [30, 60, 120, 300]

const axis = {
  stroke: 'var(--edge)',
  tick: { fill: 'var(--text-3)', fontSize: 11 },
  tickLine: false as const,
}
const tip = {
  contentStyle: {
    background: 'var(--glass-solid)',
    border: '1px solid var(--edge-strong)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text-3)' },
  itemStyle: { color: 'var(--text)' },
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

export default function MonitorTab() {
  const mon = useMonitor()
  const [range, setRange] = useState<Range>('24')
  const [interval, setIntervalSec] = useState(60)
  const [busy, setBusy] = useState(false)

  const now = useNow()
  const hours = Number(range)
  const from = now - hours * HOUR

  const samples = useMemo(() => inRange(mon.samples, hours, now), [mon.samples, hours, now])
  const events = useMemo(() => inRange(mon.events, hours, now), [mon.events, hours, now])

  const rssi = useMemo(() => rssiStats(samples), [samples])
  const gw = useMemo(() => latencyStats(samples, 'gw_ms'), [samples])
  const net = useMemo(() => latencyStats(samples, 'net_ms'), [samples])
  const dns = useMemo(() => latencyStats(samples, 'dns_ms'), [samples])
  const up = useMemo(() => uptimeStats(samples), [samples])
  const channels = useMemo(() => channelHistory(samples), [samples])
  const report = useMemo(() => dailyReport(samples, events), [samples, events])

  const last = mon.samples.length ? mon.samples[mon.samples.length - 1] : null
  const lastSeen = mon.state.last_seen ?? last?.t ?? null
  const stale = lastSeen === null || now - lastSeen > mon.state.interval * 1000 * 3 + 5000
  const live = mon.state.enabled && !stale

  const toggle = async () => {
    setBusy(true)
    try {
      await mon.setMonitoring(!mon.state.enabled, interval)
      toast(mon.state.enabled ? 'Monitoring stopped.' : 'Monitoring started. The first reading arrives within a minute or so.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reach the board.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasData = samples.length > 0
  const tickFmt = (t: number) => (hours > 24 ? fmtDateTime(t) : fmtClock(t))
  const xAxis = {
    dataKey: 't',
    type: 'number' as const,
    scale: 'time' as const,
    domain: [from, now] as [number, number],
    tickFormatter: tickFmt,
    minTickGap: 48,
    ...axis,
  }
  const labelFmt = (t: unknown) => fmtDateTime(Number(t))
  const drops = events.filter(e => e.event === 'disconnect').slice(-40)

  const rssiData = samples.map(s => ({ t: s.t, rssi: s.rssi }))
  const latData = samples.map(s => ({ t: s.t, gw: s.gw_ms, net: s.net_ms }))

  return (
    <>
      {/* control + device health */}
      <GlassCard eyebrow="Monitor Mode" title="Always-on Monitoring" icon={<Activity size={16} />}
        action={
          mon.source === 'demo' ? <Badge tone="fair">Demo data</Badge>
          : live ? <Badge tone="strong">Monitoring</Badge>
          : mon.state.enabled ? <Badge tone="fair">Waiting for the board</Badge>
          : <Badge tone="neutral">Off</Badge>
        }
      >
        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          Plug the board in next to your router with a USB charger. It checks your signal, speed to the router,
          internet and neighbouring networks around the clock, so you can see what happens when you are not looking.
        </p>

        {mon.source === 'device' && !mon.reachable && (
          <p className="text-xs text-[var(--warn-text)] mt-3">
            The dashboard cannot reach the backend. Start it and this page will fill in on its own.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {mon.source === 'device' ? (
            <>
              <Button variant="primary" onClick={toggle} disabled={busy || !mon.reachable}>
                {mon.state.enabled ? <><Square size={14} /> Stop monitoring</> : <><Play size={14} /> Start monitoring</>}
              </Button>
              <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                <span>Check every</span>
                <select
                  className="select"
                  value={interval}
                  disabled={mon.state.enabled}
                  onChange={e => setIntervalSec(Number(e.target.value))}
                >
                  {INTERVALS.map(i => (
                    <option key={i} value={i}>{i < 60 ? `${i} s` : `${i / 60} min`}</option>
                  ))}
                </select>
              </label>
              <Button onClick={loadMonitorDemo}><Database size={14} /> Preview with demo data</Button>
            </>
          ) : (
            <Button onClick={clearMonitorDemo}>Leave demo</Button>
          )}
        </div>

        {(last || lastSeen) && mon.source === 'device' && (
          <p className="text-[11px] text-[var(--text-3)] border-t border-[var(--edge)] pt-3 mt-4 font-mono">
            Last reading {lastSeen ? ago(now - lastSeen) : '--'}
            {last?.up != null && <> · board up {fmtDuration(last.up * 1000)}</>}
            {last?.heap != null && <> · free memory {Math.round(last.heap / 1024)} KB</>}
          </p>
        )}
      </GlassCard>

      {!hasData ? (
        <GlassCard className="items-center text-center py-10">
          <Wifi size={34} className="text-[var(--text-2)] opacity-75 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[var(--text)]">No readings yet</h2>
          <p className="text-sm text-[var(--text-2)] max-w-md mx-auto mt-1">
            Press Start monitoring with the board connected to your Wi-Fi. Charts appear after a few readings.
            Want a look first? Use the demo data button above.
          </p>
        </GlassCard>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--text-3)] font-mono">
              {samples.length} readings · {events.length} connection event{events.length === 1 ? '' : 's'}
            </p>
            <Segmented options={RANGES} value={range} onChange={setRange} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard
              label="Signal"
              value={rssi.avg ?? '--'}
              unit={rssi.avg !== null ? 'dBm' : undefined}
              tone={rssi.avg !== null ? signalLevel(rssi.avg) : 'neutral'}
              sub={rssi.swing !== null ? `moves ±${rssi.swing} dBm` : 'not connected'}
              icon={<Wifi size={16} />}
            />
            <StatCard
              label="Router Speed"
              value={gw.avg ?? '--'}
              unit={gw.avg !== null ? 'ms' : undefined}
              tone={gw.avg === null ? 'neutral' : gw.avg < 20 ? 'strong' : gw.avg < 60 ? 'fair' : 'weak'}
              sub={gw.p95 !== null ? `95% under ${gw.p95} ms` : 'no reply'}
              icon={<Gauge size={16} />}
            />
            <StatCard
              label="Internet Uptime"
              value={up.pct ?? '--'}
              unit={up.pct !== null ? '%' : undefined}
              tone={up.pct === null ? 'neutral' : up.pct >= 99 ? 'strong' : up.pct >= 95 ? 'fair' : 'weak'}
              sub={`${up.outages.length} outage${up.outages.length === 1 ? '' : 's'}`}
              icon={<Globe size={16} />}
            />
            <StatCard
              label="Name Lookup"
              value={dns.avg ?? '--'}
              unit={dns.avg !== null ? 'ms' : undefined}
              tone={dns.avg === null ? 'neutral' : dns.avg < 60 ? 'strong' : dns.avg < 150 ? 'fair' : 'weak'}
              sub={net.avg !== null ? `internet reply ${net.avg} ms` : 'failed'}
              icon={<Clock size={16} />}
            />
          </div>

          <GlassCard eyebrow="Timeline" title="Signal Timeline" sub="Red lines mark Wi-Fi disconnects">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rssiData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--edge)" vertical={false} />
                  <XAxis {...xAxis} />
                  <YAxis domain={[-100, -30]} {...axis} />
                  <Tooltip {...tip} labelFormatter={labelFmt} formatter={v => [`${v} dBm`, 'Signal']} />
                  <ReferenceLine y={GOOD_RSSI} stroke="var(--warn)" strokeDasharray="4 4" />
                  <ReferenceLine y={DEAD_RSSI} stroke="var(--err)" strokeDasharray="4 4" />
                  {drops.map(e => (
                    <ReferenceLine key={e.t} x={e.t} stroke="var(--err)" strokeOpacity={0.55} />
                  ))}
                  <Line type="monotone" dataKey="rssi" stroke="var(--text)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
            <GlassCard eyebrow="Latency" title="Router and Internet Speed" sub="Lower is better. Gaps mean no reply.">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--edge)" vertical={false} />
                    <XAxis {...xAxis} />
                    <YAxis {...axis} unit=" ms" />
                    <Tooltip {...tip} labelFormatter={labelFmt} />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-3)' }} />
                    <Line type="monotone" name="Router" dataKey="gw" stroke="var(--text)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                    <Line type="monotone" name="Internet" dataKey="net" stroke="var(--accent-2)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard eyebrow="Spectrum" title="Channel Traffic History" sub="How crowded channels 1, 6 and 11 were">
              {channels.length < 2 ? (
                <p className="text-xs text-[var(--text-2)] leading-relaxed py-6">
                  Neighbour scans are taken every few readings. The history appears after a couple of them.
                </p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={channels} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="var(--edge)" vertical={false} />
                      <XAxis {...xAxis} />
                      <YAxis domain={[0, 100]} {...axis} unit="%" />
                      <Tooltip {...tip} labelFormatter={labelFmt} />
                      <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-3)' }} />
                      <Area type="monotone" name="Channel 1" dataKey="ch1" stroke="var(--strong)" fill="var(--strong)" fillOpacity={0.12} strokeWidth={1.6} isAnimationActive={false} />
                      <Area type="monotone" name="Channel 6" dataKey="ch6" stroke="var(--fair)" fill="var(--fair)" fillOpacity={0.12} strokeWidth={1.6} isAnimationActive={false} />
                      <Area type="monotone" name="Channel 11" dataKey="ch11" stroke="var(--accent-2)" fill="var(--accent-2)" fillOpacity={0.12} strokeWidth={1.6} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
            <GlassCard eyebrow="Uptime" title="Internet Outages" icon={<Globe size={16} />}
              action={<Badge tone={up.pct === null ? 'neutral' : up.pct >= 99 ? 'strong' : up.pct >= 95 ? 'fair' : 'weak'}>{up.pct ?? '--'}% up</Badge>}
            >
              {up.outages.length === 0 ? (
                <p className="text-xs text-[var(--text-2)]">No outages in this period. The internet was reachable every time the board checked.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {[...up.outages].reverse().slice(0, 8).map(o => (
                    <li key={o.start} className="flex items-center justify-between gap-3 text-xs border-b border-[var(--edge)] pb-2">
                      <span className="font-mono text-[var(--text-2)]">
                        {fmtDateTime(o.start)} → {o.ongoing ? 'now' : fmtClock(o.end)}
                      </span>
                      <Badge tone="weak">{fmtDuration(o.ms)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-[var(--text-3)] mt-3">
                A reading counts as down when the board has no Wi-Fi link or cannot reach the internet.
              </p>
            </GlassCard>

            <GlassCard eyebrow="Log" title="Connection Health" icon={<WifiOff size={16} />}>
              {events.length === 0 ? (
                <p className="text-xs text-[var(--text-2)]">No disconnects or reconnects recorded in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[300px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--edge)]">
                        <th className="font-semibold pb-2">When</th>
                        <th className="font-semibold pb-2">What</th>
                        <th className="font-semibold pb-2 text-right">Down for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...events].reverse().slice(0, 12).map(e => (
                        <tr key={`${e.t}-${e.event}`} className="border-t border-[var(--edge)]">
                          <td className="py-2 font-mono text-[var(--text-2)]">{fmtDateTime(e.t)}</td>
                          <td className="py-2">
                            <Badge tone={e.event === 'disconnect' ? 'weak' : 'strong'}>
                              {e.event === 'disconnect' ? 'Dropped' : 'Back online'}
                            </Badge>
                            {e.event === 'disconnect' && (
                              <span className="text-[var(--text-3)] ml-2">{reasonLabel(e.reason)}</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono text-[var(--text-2)]">
                            {e.down_s != null ? fmtDuration(e.down_s * 1000) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </div>

          <GlassCard eyebrow="Summary" title="Environment Report" sub={`Last ${hours === 168 ? '7 days' : `${hours} hours`}`}>
            <ul className="flex flex-col gap-2.5">
              {report.map(line => (
                <li key={line} className="text-sm text-[var(--text-2)] leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}
    </>
  )
}
