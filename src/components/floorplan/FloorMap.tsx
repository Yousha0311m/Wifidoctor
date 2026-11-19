// FloorMap.tsx | SignalFLoor | Interactive Konva floorplan with live operator navigation vector & laser distance ruler

import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Text, Line, Circle, Group, Wedge, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { Room, RulerMeasurement, ScanPoint } from '@/types'
import { measureSpan } from '@/lib/analytics'
import { CANVAS_W, CANVAS_H, clamp } from '@/lib/floor'
import { signalLevel } from '@/lib/signal'
import { renderHeatCanvas, type HeatGrid } from '@/lib/heatmap'
import type { Spot } from '@/lib/spots'
import { useCanvasColors } from '@/hooks/useCanvasColors'

export interface Marker {
  x: number
  y: number
  label: string
  kind: 'dead' | 'extender'
}

export type FloorMapTool = 'scan' | 'operator' | 'ruler'

interface Props {
  rooms: Room[]
  points: ScanPoint[]
  pending?: { x: number; y: number } | null
  router?: { x: number; y: number } | null
  heat?: HeatGrid | null
  heatOpacity?: number
  spots?: Spot[]
  nextId?: string | null
  markers?: Marker[]
  showPoints?: boolean
  showRouter?: boolean
  operator?: { x: number; y: number; heading: number } | null
  navTarget?: { x: number; y: number; label?: string } | null
  ruler?: RulerMeasurement | null
  toolMode?: FloorMapTool
  onTap?: (x: number, y: number) => void
  onOperatorMove?: (x: number, y: number) => void
  onRulerChange?: (ruler: RulerMeasurement | null) => void
}

export default function FloorMap({
  rooms,
  points,
  pending,
  router,
  heat,
  heatOpacity = 0.75,
  spots,
  nextId,
  markers,
  showPoints = true,
  showRouter = true,
  operator,
  navTarget,
  ruler,
  toolMode = 'scan',
  onTap,
  onOperatorMove,
  onRulerChange,
}: Props) {
  const c = useCanvasColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(CANVAS_W)
  const scale = width / CANVAS_W

  const rulerDragRef = useRef<{ x1: number; y1: number; awaitingSecondTap: boolean; active: boolean } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const heatCanvas = useMemo(
    () => (heat ? renderHeatCanvas(heat, { weak: c.weak, fair: c.fair, strong: c.strong }) : null),
    [heat, c.weak, c.fair, c.strong],
  )

  const getPos = () => {
    const p = stageRef.current?.getRelativePointerPosition()
    if (!p) return null
    return {
      x: Math.round(clamp(p.x, 0, CANVAS_W)),
      y: Math.round(clamp(p.y, 0, CANVAS_H)),
    }
  }

  const handleStageDown = () => {
    const p = getPos()
    if (!p) return

    if (toolMode === 'ruler' && onRulerChange) {
      const cur = rulerDragRef.current
      if (cur?.awaitingSecondTap) {
        onRulerChange({ x1: cur.x1, y1: cur.y1, x2: p.x, y2: p.y })
        rulerDragRef.current = null
        return
      }
      rulerDragRef.current = { x1: p.x, y1: p.y, awaitingSecondTap: false, active: true }
      onRulerChange({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      return
    }

    if (toolMode === 'operator' && onOperatorMove) {
      onOperatorMove(p.x, p.y)
      return
    }

    if (onTap) {
      onTap(p.x, p.y)
    }
  }

  const handleStageMove = () => {
    if (toolMode !== 'ruler' || !onRulerChange) return
    const cur = rulerDragRef.current
    if (!cur || (!cur.active && !cur.awaitingSecondTap)) return
    const p = getPos()
    if (!p) return
    onRulerChange({ x1: cur.x1, y1: cur.y1, x2: p.x, y2: p.y })
  }

  const handleStageUp = () => {
    if (toolMode !== 'ruler') return
    const cur = rulerDragRef.current
    if (!cur || !cur.active) return
    const p = getPos()
    if (!p) {
      rulerDragRef.current = null
      return
    }
    const moved = Math.hypot(p.x - cur.x1, p.y - cur.y1)
    if (moved < 6) {
      rulerDragRef.current = { x1: cur.x1, y1: cur.y1, awaitingSecondTap: true, active: false }
    } else {
      rulerDragRef.current = null
    }
  }

  const vLines = Array.from({ length: CANVAS_W / 50 + 1 }, (_, i) => i * 50)
  const hLines = Array.from({ length: CANVAS_H / 50 + 1 }, (_, i) => i * 50)
  const last = points[points.length - 1]

  const activeTarget = navTarget ?? pending ?? null
  const navMetrics = useMemo(() => {
    if (!operator || !activeTarget) return null
    return measureSpan(operator.x, operator.y, activeTarget.x, activeTarget.y, rooms)
  }, [operator, activeTarget, rooms])

  const rulerMetrics = useMemo(() => {
    if (!ruler) return null
    if (Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) < 4) return null
    return measureSpan(ruler.x1, ruler.y1, ruler.x2, ruler.y2, rooms)
  }, [ruler, rooms])

  return (
    <div ref={wrapRef} className="canvas-well w-full">
      <Stage
        ref={stageRef}
        width={width}
        height={CANVAS_H * scale}
        scale={{ x: scale, y: scale }}
        onMouseDown={handleStageDown}
        onTouchStart={handleStageDown}
        onMouseMove={handleStageMove}
        onTouchMove={handleStageMove}
        onMouseUp={handleStageUp}
        onTouchEnd={handleStageUp}
        style={{ cursor: onTap || toolMode !== 'scan' ? 'crosshair' : 'default' }}
      >
        {/* 1. coordinate grid + meter markers + room fills */}
        <Layer listening={false}>
          {vLines.map(x => (
            <Line key={`v${x}`} points={[x, 0, x, CANVAS_H]} stroke={c.grid} strokeWidth={1} />
          ))}
          {hLines.map(y => (
            <Line key={`h${y}`} points={[0, y, CANVAS_W, y]} stroke={c.grid} strokeWidth={1} />
          ))}
          <Rect width={CANVAS_W} height={CANVAS_H} stroke={c.line} strokeWidth={1} />
          {vLines
            .filter((_, i) => i > 0 && i < vLines.length - 1 && i % 2 === 0)
            .map(x => (
              <Text
                key={`mx${x}`}
                x={x + 4}
                y={4}
                text={`${x / 50}m`}
                fill={c.muted}
                opacity={0.45}
                fontSize={9}
                fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
              />
            ))}
          {rooms.map(r => (
            <Rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={c['panel-2']} />
          ))}
        </Layer>

        {/* 2. interpolated heatmap */}
        {heatCanvas && (
          <Layer listening={false}>
            <KonvaImage
              image={heatCanvas}
              x={0}
              y={0}
              width={CANVAS_W}
              height={CANVAS_H}
              opacity={heatOpacity}
              globalCompositeOperation={(c['heat-blend'] || 'source-over') as GlobalCompositeOperation}
            />
          </Layer>
        )}

        {/* 3. walls, labels, router rings, scan points, wayfinding & ruler */}
        <Layer listening={false}>
          {rooms.map(r => (
            <Rect
              key={r.id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              stroke={c.wall}
              strokeWidth={1.6}
            />
          ))}
          {rooms.map(r => {
            const labelText = r.w >= 145
              ? `${r.name} · ${(r.w / 50).toFixed(1)}×${(r.h / 50).toFixed(1)}m`
              : r.name
            const pillW = Math.max(44, Math.min(r.w - 16, Math.round(labelText.length * 6.9 + 14)))
            return (
              <Group key={`t${r.id}`} x={r.x} y={r.y}>
                {r.w >= 60 && r.h >= 36 && (
                  <Rect
                    x={8}
                    y={8}
                    width={pillW}
                    height={22}
                    cornerRadius={6}
                    fill={c.bg}
                    opacity={0.7}
                  />
                )}
                <Text
                  x={15}
                  y={13}
                  width={Math.max(24, pillW - 14)}
                  text={labelText}
                  fill={c.ink}
                  opacity={0.92}
                  fontSize={11}
                  fontStyle="bold"
                  ellipsis
                  wrap="none"
                  fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                />
              </Group>
            )
          })}

          {showRouter && router && (
            <Group x={router.x} y={router.y}>
              <Circle radius={26} stroke={c['accent-2']} strokeWidth={1} opacity={0.25} dash={[4, 4]} />
              <Circle radius={16} stroke={c['accent-2']} strokeWidth={1} opacity={0.45} />
              <Circle radius={8} fill={c.panel} stroke={c['accent-2']} strokeWidth={2.2} />
              <Text
                x={-36}
                y={13}
                width={72}
                align="center"
                text="Router"
                fill={c['accent-2']}
                fontSize={10.5}
                fontStyle="bold"
                fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
              />
            </Group>
          )}

          {spots?.map((s, i) => {
            if (s.done) return null
            const isNext = s.id === nextId
            return (
              <Group key={s.id} x={s.x} y={s.y}>
                <Circle
                  radius={isNext ? 17 : 13}
                  stroke={isNext ? c.accent : c.muted}
                  strokeWidth={isNext ? 2 : 1.4}
                  dash={[4, 3]}
                />
                <Text
                  x={-16}
                  y={-5}
                  width={32}
                  align="center"
                  text={String(i + 1)}
                  fill={isNext ? c.accent : c.muted}
                  fontSize={10.5}
                  fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                />
              </Group>
            )
          })}

          {showPoints &&
            points.map(p => (
              <Circle
                key={p.id}
                x={p.x}
                y={p.y}
                radius={6}
                fill={c[signalLevel(p.rssi)]}
                stroke={c.bg}
                strokeWidth={2}
              />
            ))}

          {showPoints && last && (
            <Circle x={last.x} y={last.y} radius={11} stroke={c.ink} strokeWidth={1} opacity={0.55} />
          )}

          {pending && (
            <Group x={pending.x} y={pending.y}>
              <Circle radius={22} stroke={c.accent} strokeWidth={1.8} dash={[5, 4]} />
              <Line points={[-28, 0, -10, 0]} stroke={c.accent} strokeWidth={1.2} />
              <Line points={[10, 0, 28, 0]} stroke={c.accent} strokeWidth={1.2} />
              <Line points={[0, -28, 0, -10]} stroke={c.accent} strokeWidth={1.2} />
              <Line points={[0, 10, 0, 28]} stroke={c.accent} strokeWidth={1.2} />
              <Circle radius={3.5} fill={c.accent} />
            </Group>
          )}

          {/* Wayfinding guidance path from operator to target */}
          {operator && activeTarget && navMetrics && navMetrics.px > 4 && (
            <Group>
              <Line
                points={[operator.x, operator.y, activeTarget.x, activeTarget.y]}
                stroke={navMetrics.meters <= 0.65 ? c.strong : c.accent}
                strokeWidth={2.4}
                dash={[8, 6]}
                opacity={0.92}
              />
              {(() => {
                const mx = (operator.x + activeTarget.x) / 2
                const my = (operator.y + activeTarget.y) / 2
                const arrived = navMetrics.meters <= 0.65
                const tag = arrived
                  ? 'ARRIVED · SCAN READY'
                  : `${navMetrics.meters.toFixed(1)}m · ${navMetrics.steps} step${navMetrics.steps === 1 ? '' : 's'} · ${navMetrics.cardinal}`
                const pillW = Math.round(tag.length * 6.7 + 16)
                return (
                  <Group x={clamp(mx - pillW / 2, 8, CANVAS_W - pillW - 8)} y={clamp(my - 12, 8, CANVAS_H - 28)}>
                    <Rect
                      width={pillW}
                      height={22}
                      cornerRadius={7}
                      fill={c.bg}
                      stroke={arrived ? c.strong : c.accent}
                      strokeWidth={1.2}
                      opacity={0.92}
                    />
                    <Text
                      x={8}
                      y={5}
                      text={tag}
                      fill={arrived ? c.strong : c.ink}
                      fontSize={10.5}
                      fontStyle="bold"
                      fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                    />
                  </Group>
                )
              })()}
            </Group>
          )}

          {/* Live operator position & directional FOV cone */}
          {operator && (
            <Group x={operator.x} y={operator.y}>
              <Wedge
                radius={42}
                angle={54}
                rotation={operator.heading - 90 - 27}
                fill={c['accent-2']}
                opacity={0.22}
              />
              <Circle radius={18} stroke={c.strong} strokeWidth={1.2} dash={[3, 3]} opacity={0.7} />
              <Circle radius={9} fill={c.strong} stroke={c.bg} strokeWidth={2.4} />
              <Rect
                x={-20}
                y={13}
                width={40}
                height={17}
                cornerRadius={5}
                fill={c.bg}
                stroke={c.strong}
                strokeWidth={1}
                opacity={0.9}
              />
              <Text
                x={-20}
                y={16}
                width={40}
                align="center"
                text="YOU"
                fill={c.strong}
                fontSize={10}
                fontStyle="bold"
                fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
              />
            </Group>
          )}

          {/* Interactive laser distance & wall-loss ruler */}
          {ruler && rulerMetrics && (
            <Group>
              <Line
                points={[ruler.x1, ruler.y1, ruler.x2, ruler.y2]}
                stroke={c.fair}
                strokeWidth={2.4}
              />
              <Circle x={ruler.x1} y={ruler.y1} radius={6} fill={c.bg} stroke={c.fair} strokeWidth={2.2} />
              <Circle x={ruler.x2} y={ruler.y2} radius={6} fill={c.bg} stroke={c.fair} strokeWidth={2.2} />
              {(() => {
                const mx = (ruler.x1 + ruler.x2) / 2
                const my = (ruler.y1 + ruler.y2) / 2
                const txt = `${rulerMetrics.meters.toFixed(2)}m (${rulerMetrics.steps} steps) · ${rulerMetrics.wallsCrossed} wall${rulerMetrics.wallsCrossed === 1 ? '' : 's'} · -${rulerMetrics.estLossDb}dB`
                const pillW = Math.round(txt.length * 6.5 + 16)
                return (
                  <Group x={clamp(mx - pillW / 2, 8, CANVAS_W - pillW - 8)} y={clamp(my - 28, 8, CANVAS_H - 28)}>
                    <Rect
                      width={pillW}
                      height={22}
                      cornerRadius={7}
                      fill={c.bg}
                      stroke={c.fair}
                      strokeWidth={1.3}
                      opacity={0.95}
                    />
                    <Text
                      x={8}
                      y={5}
                      text={txt}
                      fill={c.fair}
                      fontSize={10.5}
                      fontStyle="bold"
                      fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                    />
                  </Group>
                )
              })()}
            </Group>
          )}

          {markers?.map(m => (
            <Group key={`${m.kind}-${m.label}`} x={m.x} y={m.y}>
              {m.kind === 'dead' ? (
                <Circle radius={34} stroke={c.weak} strokeWidth={2} dash={[6, 4]} />
              ) : (
                <Circle radius={9} fill={c['accent-2']} stroke={c.bg} strokeWidth={2} />
              )}
              <Text
                x={-32}
                y={m.kind === 'dead' ? -52 : 13}
                width={64}
                align="center"
                text={m.label}
                fill={m.kind === 'dead' ? c.weak : c['accent-2']}
                fontSize={11}
                fontStyle="bold"
                fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
