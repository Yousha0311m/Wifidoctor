// FloorMap.tsx | SignalFLoor | Read-only Konva floorplan: heatmap, scan points, spots, markers, tap-to-pick (touch friendly)

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Stage, Layer, Rect, Text, Line, Circle, Group, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import type { Room, ScanPoint } from '@/types'
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
  onTap?: (x: number, y: number) => void
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
  onTap,
}: Props) {
  const c = useCanvasColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [width, setWidth] = useState(CANVAS_W)
  const scale = width / CANVAS_W

  // Pulsing glow rings behind the scan points. One animation loop moves every ring, and it
  // only touches the ring layer, so the heatmap underneath is never redrawn.
  const pulseLayerRef = useRef<Konva.Layer>(null)
  useEffect(() => {
    const layer = pulseLayerRef.current
    if (!layer || !showPoints) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const anim = new Konva.Animation(frame => {
      const t = (frame?.time ?? 0) / 2200
      layer.getChildren().forEach((node, i) => {
        const phase = (t + (i % 7) * 0.13) % 1 // spread the rings so they do not all beat together
        node.scale({ x: 1 + phase * 1.9, y: 1 + phase * 1.9 })
        node.opacity(0.55 * (1 - phase))
      })
    }, layer)
    anim.start()
    return () => {
      anim.stop()
    }
  }, [showPoints, points.length])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(200, Math.floor(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const heatCanvas = useMemo(
    () => (heat ? renderHeatCanvas(heat, { weak: c.weak, fair: c.fair, strong: c.strong }) : null),
    [heat, c.weak, c.fair, c.strong],
  )

  // Tap detection with plain pointer events: a press that barely moves and ends quickly counts as a tap.
  // Scrolling the page with a finger starts a scroll gesture (pointercancel), so it never registers as a tap.
  const downRef = useRef<{ id: number; cx: number; cy: number; t: number } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    downRef.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, t: performance.now() }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = downRef.current
    downRef.current = null
    if (!d || d.id !== e.pointerId || !onTap) return
    if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 10 || performance.now() - d.t > 600) return
    const box = e.currentTarget.getBoundingClientRect()
    onTap(
      Math.round(clamp((e.clientX - box.left) / scale, 0, CANVAS_W)),
      Math.round(clamp((e.clientY - box.top) / scale, 0, CANVAS_H)),
    )
  }

  const vLines = Array.from({ length: CANVAS_W / 50 + 1 }, (_, i) => i * 50)
  const hLines = Array.from({ length: CANVAS_H / 50 + 1 }, (_, i) => i * 50)
  const last = points[points.length - 1]

  return (
    <div
      ref={wrapRef}
      className="canvas-well w-full"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        downRef.current = null
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={CANVAS_H * scale}
        scale={{ x: scale, y: scale }}
        listening={false}
        style={{ cursor: onTap ? 'crosshair' : 'default' }}
      >
        {/* 1. coordinate grid + room fills */}
        <Layer listening={false}>
          {vLines.map(x => (
            <Line key={`v${x}`} points={[x, 0, x, CANVAS_H]} stroke={c.grid} strokeWidth={1} />
          ))}
          {hLines.map(y => (
            <Line key={`h${y}`} points={[0, y, CANVAS_W, y]} stroke={c.grid} strokeWidth={1} />
          ))}
          <Rect width={CANVAS_W} height={CANVAS_H} stroke={c.line} strokeWidth={1} />
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

        {/* 3. walls, labels, router rings, scan points, markers */}
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
            const labelText = r.name
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
                shadowColor={c[signalLevel(p.rssi)]}
                shadowBlur={14}
                shadowOpacity={0.9}
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

        {/* 4. pulsing rings (animated, drawn above the points, never intercepts taps) */}
        <Layer ref={pulseLayerRef} listening={false}>
          {showPoints &&
            points.map(p => (
              <Circle
                key={`pulse-${p.id}`}
                x={p.x}
                y={p.y}
                radius={7}
                stroke={c[signalLevel(p.rssi)]}
                strokeWidth={1.6}
                opacity={0.4}
              />
            ))}
        </Layer>
      </Stage>
    </div>
  )
}