// Heatmap.tsx | SignalFLoor | Streamlined IDW attenuation heatmap view with opacity, unified layer toggles & laser ruler

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crosshair, Database, Eye, EyeOff, Flame, Router, Ruler } from 'lucide-react'
import FloorMap, { type Marker } from '@/components/floorplan/FloorMap'
import { Badge, Button, GlassCard } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { useSettings } from '@/hooks/useSettings'
import { inRoom, measureSpan } from '@/lib/analytics'
import { computeHeatGrid, valueAt } from '@/lib/heatmap'
import { findDeadZones, recommend } from '@/lib/recommend'
import { getRouterPos } from '@/lib/scanner'
import { levelText, rssiToPercent, signalLevel } from '@/lib/signal'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import { loadDemoWorkspace } from '@/lib/workspace'
import type { RulerMeasurement } from '@/types'

export default function Heatmap() {
  const navigate = useNavigate()
  const { rooms } = useFloor()
  const { points } = useScan()
  const { settings } = useSettings()

  const [showPoints, setShowPoints] = useState(true)
  const [showOverlays, setShowOverlays] = useState(true)
  const [showRouter, setShowRouter] = useState(true)
  const [heatOpacity, setHeatOpacity] = useState(0.75)
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null)
  const [rulerMode, setRulerMode] = useState(false)
  const [ruler, setRuler] = useState<RulerMeasurement | null>(null)

  const heat = useMemo(() => computeHeatGrid(rooms, points), [rooms, points])
  const router = useMemo(() => getRouterPos(rooms, settings.routerPos), [rooms, settings.routerPos])
  const zones = useMemo(() => findDeadZones(rooms, points), [rooms, points])
  const recs = useMemo(() => recommend(rooms, zones, points, heat), [rooms, zones, points, heat])

  const markers: Marker[] = useMemo(() => {
    if (!showOverlays) return []
    return [
      ...zones.map(z => ({ x: z.cx, y: z.cy, label: `DZ${z.id}`, kind: 'dead' as const })),
      ...recs.map(r => ({ x: r.x, y: r.y, label: `E${r.zone.id}`, kind: 'extender' as const })),
    ]
  }, [recs, showOverlays, zones])

  const probeValue = heat && probe ? valueAt(heat, probe.x, probe.y) : null
  const probeRoom = probe ? rooms.find(r => inRoom(probe, r))?.name ?? 'Unmapped' : null
  const rulerMetrics = useMemo(() => {
    if (!ruler || Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) < 4) return null
    return measureSpan(ruler.x1, ruler.y1, ruler.x2, ruler.y2, rooms)
  }, [ruler, rooms])

  if (rooms.length === 0 || points.length === 0) {
    const noRooms = rooms.length === 0
    return (
      <>
        <div className="view-head">
          <div>
            <h1>Heatmap</h1>
            <p>Inverse-distance weighted RF propagation &amp; coordinate probe.</p>
          </div>
        </div>
        <GlassCard className="items-center text-center py-12">
          <Flame size={36} className="text-[var(--text-2)] opacity-75 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[var(--text)]">
            {noRooms ? 'No floor plan yet' : 'No scan data yet'}
          </h2>
          <p className="text-sm text-[var(--text-2)] max-w-sm mx-auto mt-1 mb-4">
            {noRooms
              ? 'Draw your rooms first, or load the demo workspace.'
              : 'Scan a few spots across rooms and the IDW heatmap renders live.'}
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

  const rssis = points.map(p => p.rssi)
  const best = Math.max(...rssis)
  const worst = Math.min(...rssis)

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Heatmap</h1>
          <p>Continuous IDW signal strength map and tap-to-probe inspector.</p>
        </div>
      </div>

      <div className="toolbar glass">
        <div className="tb-row">
          <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
            <span className="font-mono">-85</span>
            <div
              className="h-2 w-40 rounded-full"
              style={{ background: 'linear-gradient(to right, var(--weak), var(--fair), var(--strong))' }}
            />
            <span className="font-mono">-50 dBm</span>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--text-2)] ml-2">
            <span>Opacity</span>
            <input
              type="range"
              min={0.35}
              max={0.95}
              step={0.05}
              value={heatOpacity}
              onChange={e => setHeatOpacity(parseFloat(e.target.value))}
              className="w-24 accent-white"
            />
          </label>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={rulerMode ? 'primary' : 'default'}
              onClick={() => setRulerMode(r => !r)}
            >
              <Ruler size={13} />
              {rulerMode ? 'Measuring' : 'Laser Ruler'}
            </Button>
            {ruler && (
              <Button size="sm" variant="ghost" onClick={() => setRuler(null)}>
                Clear Ruler
              </Button>
            )}

            {/* Unified Layer Visibility Group */}
            <div className="flex items-center gap-0.5 border border-[var(--edge)] rounded-[10px] p-0.5 bg-[var(--panel)]">
              <button
                type="button"
                onClick={() => setShowPoints(s => !s)}
                title="Toggle Scan Points"
                style={{
                  background: showPoints ? 'var(--glass-3)' : 'transparent',
                  color: showPoints ? 'var(--text)' : 'var(--text-3)',
                }}
                className="px-2.5 py-1 text-xs rounded-[7px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                {showPoints ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>Points</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOverlays(s => !s)}
                title="Toggle Dead Zones & Extender Spots"
                style={{
                  background: showOverlays ? 'var(--glass-3)' : 'transparent',
                  color: showOverlays ? 'var(--text)' : 'var(--text-3)',
                }}
                className="px-2.5 py-1 text-xs rounded-[7px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Crosshair size={12} />
                <span>Zones</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRouter(s => !s)}
                title="Toggle Router Pin"
                style={{
                  background: showRouter ? 'var(--glass-3)' : 'transparent',
                  color: showRouter ? 'var(--text)' : 'var(--text-3)',
                }}
                className="px-2.5 py-1 text-xs rounded-[7px] font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Router size={12} />
                <span>Router</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3.5 items-start">
        <GlassCard eyebrow="Propagation Field" title="IDW Coverage Map" icon={<Flame size={17} />}>
          <FloorMap
            rooms={rooms}
            points={points}
            heat={heat}
            heatOpacity={heatOpacity}
            markers={markers}
            showPoints={showPoints}
            showRouter={showRouter}
            pending={probe}
            router={router}
            ruler={ruler}
            toolMode={rulerMode ? 'ruler' : 'scan'}
            onRulerChange={setRuler}
            onTap={(x, y) => {
              if (rooms.some(r => inRoom({ x, y }, r))) {
                sound.tick()
                setProbe({ x, y })
              }
            }}
          />
        </GlassCard>

        <div className="flex flex-col gap-3.5">
          {rulerMetrics && (
            <GlassCard eyebrow="Laser Ruler" title="Measured Span" icon={<Ruler size={16} />}>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-xs">
                <dt className="text-[var(--text-3)]">Distance</dt>
                <dd className="font-mono font-semibold text-[var(--text)]">{rulerMetrics.meters.toFixed(2)} m</dd>
                <dt className="text-[var(--text-3)]">Walking steps (~0.75m)</dt>
                <dd className="font-mono text-[var(--text)]">{rulerMetrics.steps} steps ({rulerMetrics.cardinal})</dd>
                <dt className="text-[var(--text-3)]">Walls crossed</dt>
                <dd className="font-mono text-[var(--text)]">{rulerMetrics.wallsCrossed}</dd>
                <dt className="text-[var(--text-3)]">Est. RF attenuation</dt>
                <dd className="font-mono text-[var(--warn-text)]">-{rulerMetrics.estLossDb} dB</dd>
              </dl>
            </GlassCard>
          )}
          <GlassCard eyebrow="Probe" title="Estimated at Point" icon={<Crosshair size={16} />}>
            {probe && probeValue !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-end justify-between">
                  <p className={`text-3xl font-bold font-mono ${levelText[signalLevel(probeValue)]}`}>
                    {Math.round(probeValue)}
                    <span className="text-xs text-[var(--text-3)] font-normal ml-1">dBm</span>
                  </p>
                  <Badge tone={signalLevel(probeValue)}>
                    {signalLevel(probeValue)} · {Math.round(rssiToPercent(probeValue))}%
                  </Badge>
                </div>
                <p className="font-mono text-xs text-[var(--text-2)]">
                  {probeRoom} · ({probe.x}, {probe.y})
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  Interpolated across {points.length} measured coordinate(s).
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-2)] leading-relaxed">
                Tap inside any room on the heatmap to read the estimated signal strength there.
              </p>
            )}
          </GlassCard>

          <GlassCard eyebrow="Envelope" title="Measured Range">
            <dl className="grid grid-cols-[1fr_auto] gap-y-2.5 text-xs">
              <dt className="text-[var(--text-3)]">Measured points</dt>
              <dd className="font-mono text-[var(--text)]">{points.length}</dd>
              <dt className="text-[var(--text-3)]">Strongest reading</dt>
              <dd className={`font-mono ${levelText[signalLevel(best)]}`}>{best} dBm</dd>
              <dt className="text-[var(--text-3)]">Weakest reading</dt>
              <dd className={`font-mono ${levelText[signalLevel(worst)]}`}>{worst} dBm</dd>
              <dt className="text-[var(--text-3)]">Dead zones</dt>
              <dd className={`font-mono ${zones.length ? 'text-[var(--err-text)]' : 'text-[var(--ok-text)]'}`}>
                {zones.length}
              </dd>
            </dl>
          </GlassCard>

          {points.length < 8 && (
            <GlassCard eyebrow="Hint" title="Low Sample Density">
              <p className="text-xs text-[var(--text-2)] leading-relaxed mb-3">
                Only {points.length} point(s) scanned. Adding samples across every room yields smoother contours.
              </p>
              <Button size="sm" onClick={() => navigate('/scans')}>
                Add More Scans
              </Button>
            </GlassCard>
          )}
        </div>
      </div>
    </>
  )
}
