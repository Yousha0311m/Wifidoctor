// Reports.tsx | SignalFLoor | Dead-zone diagnostic reports, extender pins & CSV/JSON export

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Download, FileText, MapPin, ShieldCheck } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, CartesianGrid, BarChart, Bar, Cell,
} from 'recharts'
import StatCard from '@/components/dashboard/StatCard'
import FloorMap, { type Marker } from '@/components/floorplan/FloorMap'
import Legend from '@/components/floorplan/Legend'
import { Badge, Button, GlassCard } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { useSettings } from '@/hooks/useSettings'
import { coveragePct, inRoom } from '@/lib/analytics'
import { computeHeatGrid } from '@/lib/heatmap'
import { DEAD_RSSI, GOOD_RSSI, findDeadZones, recommend } from '@/lib/recommend'
import { getRouterPos } from '@/lib/scanner'
import { levelBg, rssiToPercent, signalLevel } from '@/lib/signal'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import { exportTelemetryCsv, exportTelemetryJson, loadDemoWorkspace } from '@/lib/workspace'

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

export default function Reports() {
  const navigate = useNavigate()
  const { rooms } = useFloor()
  const { points } = useScan()
  const { settings } = useSettings()
  const [focusSpot, setFocusSpot] = useState<{ x: number; y: number } | null>(null)

  const heat = useMemo(() => computeHeatGrid(rooms, points), [rooms, points])
  const router = useMemo(() => getRouterPos(rooms, settings.routerPos), [rooms, settings.routerPos])
  const zones = useMemo(() => findDeadZones(rooms, points), [rooms, points])
  const recs = useMemo(() => recommend(rooms, zones, points, heat), [rooms, zones, points, heat])

  if (rooms.length === 0 || points.length === 0) {
    const noRooms = rooms.length === 0
    return (
      <>
        <div className="view-head">
          <div>
            <h1>Reports</h1>
            <p>Dead-zone detection and extender placement diagnostics.</p>
          </div>
        </div>
        <GlassCard className="items-center text-center py-12">
          <FileText size={36} className="text-[var(--text-2)] opacity-75 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[var(--text)]">
            {noRooms ? 'No floor plan yet' : 'No scan data yet'}
          </h2>
          <p className="text-sm text-[var(--text-2)] max-w-sm mx-auto mt-1 mb-4">
            {noRooms
              ? 'Draw your rooms first or load the demo workspace.'
              : 'Scan across rooms and the diagnostic report builds automatically.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="primary"
              onClick={() => {
                const res = loadDemoWorkspace()
                toast(`Loaded ${res.rooms} rooms & ${res.points} sample scans.`, 'success')
              }}
            >
              <Database size={14} /> Load Demo Home
            </Button>
            <Button onClick={() => navigate(noRooms ? '/floor-plans' : '/scans')}>
              {noRooms ? 'Go to Floor Plans' : 'Go to Scans'}
            </Button>
          </div>
        </GlassCard>
      </>
    )
  }

  const rows = rooms.map(room => {
    const pts = points.filter(p => inRoom(p, room))
    if (pts.length === 0) return { room, count: 0, avg: null, min: null, cov: null }
    const avg = Math.round(pts.reduce((s, p) => s + p.rssi, 0) / pts.length)
    return {
      room,
      count: pts.length,
      avg,
      min: Math.min(...pts.map(p => p.rssi)),
      cov: Math.round((pts.filter(p => p.rssi >= GOOD_RSSI).length / pts.length) * 100),
    }
  })

  const scanned = rows.filter(r => r.avg !== null)
  const weakest = scanned.length
    ? scanned.reduce((b, r) => ((r.avg as number) < (b.avg as number) ? r : b))
    : null
  const avgAll = Math.round(points.reduce((s, p) => s + p.rssi, 0) / points.length)
  const covAll = coveragePct(points)

  const series = [...points]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(p => ({ time: new Date(p.timestamp).toTimeString().slice(0, 8), rssi: p.rssi }))

  const dist = (['strong', 'fair', 'weak'] as const).map(level => ({
    level,
    count: points.filter(p => signalLevel(p.rssi) === level).length,
  }))

  const markers: Marker[] = [
    ...zones.map(z => ({ x: z.cx, y: z.cy, label: `DZ${z.id}`, kind: 'dead' as const })),
    ...recs.map(r => ({ x: r.x, y: r.y, label: `E${r.zone.id}`, kind: 'extender' as const })),
  ]

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Reports</h1>
          <p>Clustered dead zones (&lt; {DEAD_RSSI} dBm) and anchor-to-edge mesh extender placement.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => {
              exportTelemetryCsv(points)
              toast('CSV scan log downloaded.', 'success')
            }}
          >
            <Download size={14} /> Export CSV
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              exportTelemetryJson(rooms, points)
              toast('Diagnostic JSON report downloaded.', 'success')
            }}
          >
            <Download size={14} /> Export Report JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard label="Avg RSSI" value={avgAll} unit="dBm" tone={signalLevel(avgAll)} />
        <StatCard
          label="Coverage"
          value={covAll}
          unit="%"
          tone={covAll >= 75 ? 'strong' : covAll >= 45 ? 'fair' : 'weak'}
        />
        <StatCard label="Dead Zones" value={zones.length} tone={zones.length ? 'weak' : 'strong'} />
        <StatCard
          label="Weakest Room"
          value={weakest ? weakest.room.name : '--'}
          unit={weakest ? `${weakest.avg} dBm` : undefined}
          tone={weakest && weakest.avg !== null ? signalLevel(weakest.avg) : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3.5 items-start">
        <GlassCard eyebrow="Overlay" title="Coverage & Extender Map" action={<Legend />}>
          <FloorMap
            rooms={rooms}
            points={points}
            heat={heat}
            markers={markers}
            pending={focusSpot}
            router={router}
          />
          <p className="text-xs text-[var(--text-3)] mt-3">
            <span className="font-mono text-[var(--err-text)]">DZ</span> = dead zone (&lt; {DEAD_RSSI} dBm) ·{' '}
            <span className="font-mono text-[var(--text)]">E</span> = suggested extender spot
          </p>
        </GlassCard>

        <GlassCard eyebrow="Guidance" title="Extender Recommendations" icon={<MapPin size={16} />}>
          {zones.length === 0 ? (
            <div className="flex items-start gap-2.5 text-xs text-[var(--text-2)]">
              <ShieldCheck size={16} className="text-[var(--ok-text)] shrink-0 mt-0.5" />
              <p>No dead zones detected. Every scanned area is at or above {DEAD_RSSI} dBm.</p>
            </div>
          ) : recs.length === 0 ? (
            <p className="text-xs text-[var(--text-2)] leading-relaxed">
              Signal is weak everywhere scanned, leaving no strong anchor above {GOOD_RSSI} dBm. Move the router closer and rescan.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {recs.map(r => {
                const selected = focusSpot?.x === r.x && focusSpot?.y === r.y
                return (
                  <li key={r.zone.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sound.click()
                        setFocusSpot(selected ? null : { x: r.x, y: r.y })
                      }}
                      style={{
                        background: selected ? 'var(--glass-3)' : 'var(--glass-1)',
                        borderColor: selected ? 'var(--edge-strong)' : 'var(--edge)',
                      }}
                      className="w-full text-left p-3 rounded-[12px] border transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-semibold text-[var(--text)]">
                          E{r.zone.id} · {r.hostRoom}
                        </span>
                        <Badge tone="err">{r.zone.avg} dBm</Badge>
                      </div>
                      <p className="text-xs text-[var(--text-2)] leading-relaxed">{r.text}</p>
                      <p className="font-mono text-[11px] text-[var(--text-3)] mt-1.5">
                        extender ({r.x}, {r.y}) · zone ({r.zone.cx}, {r.zone.cy})
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-[11px] text-[var(--text-3)] border-t border-[var(--edge)] pt-3 mt-3">
            Tap a recommendation to highlight its marker on the map.
          </p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <GlassCard eyebrow="Series" title="RSSI Over Time">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--edge)" vertical={false} />
                <XAxis dataKey="time" {...axis} minTickGap={32} />
                <YAxis domain={[-95, -30]} {...axis} />
                <Tooltip {...tip} />
                <ReferenceLine y={GOOD_RSSI} stroke="var(--warn)" strokeDasharray="4 4" />
                <ReferenceLine y={DEAD_RSSI} stroke="var(--err)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="rssi"
                  stroke="var(--text)"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard eyebrow="Distribution" title="Points by Signal Quality">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--edge)" vertical={false} />
                <XAxis dataKey="level" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tip} cursor={{ fill: 'var(--glass-2)' }} />
                <Bar dataKey="count" isAnimationActive={false} radius={[5, 5, 0, 0]}>
                  {dist.map(d => (
                    <Cell key={d.level} fill={`var(--${d.level})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <GlassCard eyebrow="Matrix" title="Room Telemetry Summary">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[340px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-3)] border-b border-[var(--edge)]">
                <th className="font-semibold pb-2.5">Room</th>
                <th className="font-semibold pb-2.5 text-right">Points</th>
                <th className="font-semibold pb-2.5 text-right">Avg RSSI</th>
                <th className="font-semibold pb-2.5 text-right hidden sm:table-cell">Weakest</th>
                <th className="font-semibold pb-2.5 w-44 pl-6 hidden md:table-cell">Signal Bar</th>
                <th className="font-semibold pb-2.5 text-right">Coverage</th>
                <th className="font-semibold pb-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.room.id} className="border-t border-[var(--edge)] hover:bg-[var(--glass-1)]">
                  <td className="py-2.5 pr-3 font-semibold text-[var(--text)]">{r.room.name}</td>
                  <td className="py-2.5 text-right font-mono text-xs text-[var(--text-3)]">{r.count}</td>
                  {r.avg === null ? (
                    <td colSpan={5} className="py-2.5 text-right text-xs text-[var(--text-3)]">
                      not scanned
                    </td>
                  ) : (
                    <>
                      <td className="py-2.5 text-right font-mono text-xs text-[var(--text)]">{r.avg} dBm</td>
                      <td className="py-2.5 text-right font-mono text-xs text-[var(--text-2)] hidden sm:table-cell">{r.min} dBm</td>
                      <td className="py-2.5 pl-6 hidden md:table-cell">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${levelBg[signalLevel(r.avg)]}`}
                            style={{ width: `${rssiToPercent(r.avg)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-[var(--text)]">{r.cov}%</td>
                      <td className="py-2.5 text-right">
                        <Badge tone={signalLevel(r.avg)} className="capitalize">
                          {signalLevel(r.avg)}
                        </Badge>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  )
}