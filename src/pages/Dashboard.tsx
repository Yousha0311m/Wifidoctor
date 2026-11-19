// Dashboard.tsx | SignalFLoor | Spatial Wi-Fi telemetry overview, live network health & floor heatmap summary

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, CheckCircle2, Gauge, Map as MapIcon, Radar, ShieldCheck } from 'lucide-react'
import RecentScans from '@/components/dashboard/RecentScans'
import SignalByRoom from '@/components/dashboard/SignalByRoom'
import Sparkline from '@/components/dashboard/Sparkline'
import StatCard from '@/components/dashboard/StatCard'
import FloorMap from '@/components/floorplan/FloorMap'
import Legend from '@/components/floorplan/Legend'
import { Badge, Button, GlassCard } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { useSettings } from '@/hooks/useSettings'
import { coveragePct, roomAverages } from '@/lib/analytics'
import { computeHeatGrid } from '@/lib/heatmap'
import { fetchNetDiag, formatUptime, type NetDiagResponse } from '@/lib/nettools'
import { findDeadZones } from '@/lib/recommend'
import { getRouterPos } from '@/lib/scanner'
import { signalLevel } from '@/lib/signal'

export default function Dashboard() {
  const navigate = useNavigate()
  const { rooms } = useFloor()
  const { points } = useScan()
  const { settings } = useSettings()
  const [netDiag, setNetDiag] = useState<NetDiagResponse | null>(null)

  useEffect(() => {
    const t0 = setTimeout(() => {
      void fetchNetDiag().then(res => {
        if (res) setNetDiag(res)
      })
    }, 40)
    return () => clearTimeout(t0)
  }, [])

  const heat = useMemo(() => computeHeatGrid(rooms, points), [rooms, points])
  const router = useMemo(() => getRouterPos(rooms, settings.routerPos), [rooms, settings.routerPos])

  const has = points.length > 0
  const roomStats = roomAverages(rooms, points)
  const avg = has ? Math.round(points.reduce((s, p) => s + p.rssi, 0) / points.length) : 0
  const cov = has ? coveragePct(points) : 0
  const deadZones = findDeadZones(rooms, points).length
  const avgTone = has ? signalLevel(avg) : 'neutral'

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Dashboard</h1>
          <p>Spatial Wi-Fi telemetry across mapped rooms and ESP32 capture points.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rooms.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => navigate('/heatmap')}>
              Inspect Heatmap
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Avg RSSI"
          value={has ? avg : '--'}
          unit={has ? 'dBm' : undefined}
          tone={avgTone}
          sub={has ? `Rating: ${avgTone}` : 'Awaiting captures'}
          icon={<Activity size={16} />}
        />
        <StatCard
          label="Good Coverage"
          value={has ? cov : '--'}
          unit={has ? '%' : undefined}
          tone={has ? (cov >= 75 ? 'strong' : cov >= 45 ? 'fair' : 'weak') : 'neutral'}
          sub="Threshold >= -67 dBm"
          icon={<ShieldCheck size={16} />}
        />
        <StatCard
          label="Scan Points"
          value={points.length}
          sub={`${rooms.length} mapped room${rooms.length === 1 ? '' : 's'}`}
          icon={<Radar size={16} />}
        />
        <StatCard
          label="Dead Zones"
          value={has ? deadZones : '--'}
          tone={has ? (deadZones === 0 ? 'strong' : 'weak') : 'neutral'}
          sub={has && deadZones === 0 ? 'No weak clusters' : 'Areas below -75 dBm'}
          icon={deadZones === 0 && has ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3.5 items-start">
        <GlassCard
          eyebrow="Spatial Map"
          title="Floor Coverage Overview"
          sub={rooms.length ? `${rooms.length} room(s) rendered` : 'Draw your rooms on the Floor Plans page'}
          icon={<MapIcon size={17} />}
          action={<Legend />}
        >
          {rooms.length === 0 ? (
            <div className="h-[360px] rounded-[var(--r)] border border-dashed border-[var(--edge-strong)] flex flex-col items-center justify-center text-center p-6 gap-3">
              <MapIcon size={36} className="text-[var(--text-2)] opacity-75" />
              <div>
                <p className="text-base font-semibold text-[var(--text)]">No floor plan yet</p>
                <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm">
                  Sketch your home layout on the grid — rooms, hallways, and router placement.
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => navigate('/floor-plans')}>
                Draw Floor Plan
              </Button>
            </div>
          ) : (
            <FloorMap rooms={rooms} points={points} heat={heat} router={router} />
          )}
        </GlassCard>

        <div className="flex flex-col gap-3.5">
          {netDiag && (
            <GlassCard
              eyebrow="Live Host Health"
              title="Latency, Link & Channel Advisor"
              icon={<Gauge size={16} />}
              action={
                <Button size="sm" onClick={() => navigate('/utilities')}>
                  Utilities
                </Button>
              }
            >
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-xs">
                <dt className="text-[var(--text-3)]">Router / WAN Ping</dt>
                <dd className="font-mono text-[var(--text)]">
                  {netDiag.gatewayPing.avgMs ?? '--'} ms / {netDiag.wanPing.avgMs ?? '--'} ms
                </dd>
                <dt className="text-[var(--text-3)]">Wi-Fi PHY Link</dt>
                <dd className="font-mono text-[var(--text)]">
                  {netDiag.wifi.rxRateMbps ? `${netDiag.wifi.rxRateMbps} Mbps (${netDiag.wifi.ssid ?? ''})` : '--'}
                </dd>
                <dt className="text-[var(--text-3)]">Host Uptime</dt>
                <dd className="font-mono text-[var(--text)]">{formatUptime(netDiag.hostUptimeSec)}</dd>
                <dt className="text-[var(--text-3)]">Cleanest 2.4 GHz Channel</dt>
                <dd className="font-mono">
                  <Badge tone="strong">Ch {netDiag.best24Channel} (Cleanest)</Badge>
                </dd>
              </dl>
            </GlassCard>
          )}
          {has ? (
            <>
              <Sparkline points={points} />
              <SignalByRoom data={roomStats} />
              <RecentScans points={points} />
            </>
          ) : (
            <GlassCard
              eyebrow="Quick Start"
              title="No Scan Telemetry Yet"
              icon={<Radar size={17} />}
            >
              <p className="text-xs text-[var(--text-2)] leading-relaxed">
                Your rooms are ready to measure. Place the virtual router on the Floor Plans view, or launch the guided scanner.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button variant="primary" size="sm" onClick={() => navigate('/scans')}>
                  <Radar size={14} /> Open Scanner
                </Button>
              </div>
              <span className="chip mt-3 self-start">Tip: Press Ctrl+K anytime</span>
            </GlassCard>
          )}
        </div>
      </div>
    </>
  )
}
