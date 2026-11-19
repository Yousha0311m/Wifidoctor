// FloorPlanCanvas.tsx | SignalFLoor | Interactive Konva floorplan editor with resize, router pin & laser distance ruler

import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Text, Group, Line, Circle, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Room, RulerMeasurement } from '@/types'
import { measureSpan } from '@/lib/analytics'
import { CANVAS_W, CANVAS_H, MIN_ROOM, snap, clamp } from '@/lib/floor'
import { useCanvasColors } from '@/hooks/useCanvasColors'

export type Mode = 'select' | 'draw' | 'router' | 'ruler'

interface Rect4 { x: number; y: number; w: number; h: number }

interface Props {
  rooms: Room[]
  selectedId: string | null
  mode: Mode
  routerPos?: { x: number; y: number } | null
  ruler?: RulerMeasurement | null
  onSelect: (id: string | null) => void
  onAdd: (rect: Rect4) => string
  onUpdate: (id: string, patch: Partial<Room>) => void
  onSetRouter?: (pos: { x: number; y: number }) => void
  onRulerChange?: (ruler: RulerMeasurement | null) => void
}

export default function FloorPlanCanvas({
  rooms,
  selectedId,
  mode,
  routerPos,
  ruler,
  onSelect,
  onAdd,
  onUpdate,
  onSetRouter,
  onRulerChange,
}: Props) {
  const c = useCanvasColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)

  const [width, setWidth] = useState(CANVAS_W)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<Rect4 | null>(null)
  const rulerDragRef = useRef<{ x1: number; y1: number; awaitingSecondTap: boolean; active: boolean } | null>(null)

  const scale = width / CANVAS_W

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node =
      mode === 'select' && selectedId
        ? stage.findOne((n: Konva.Node) => n.id() === selectedId)
        : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, mode, rooms])

  const pointer = () => stageRef.current?.getRelativePointerPosition() ?? null

  const rulerMetrics = useMemo(() => {
    if (!ruler || Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) < 4) return null
    return measureSpan(ruler.x1, ruler.y1, ruler.x2, ruler.y2, rooms)
  }, [ruler, rooms])

  const handleDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (mode === 'ruler' && onRulerChange) {
      const p = pointer()
      if (!p) return
      const rx = Math.round(clamp(p.x, 0, CANVAS_W))
      const ry = Math.round(clamp(p.y, 0, CANVAS_H))
      const cur = rulerDragRef.current
      if (cur?.awaitingSecondTap) {
        onRulerChange({ x1: cur.x1, y1: cur.y1, x2: rx, y2: ry })
        rulerDragRef.current = null
        return
      }
      rulerDragRef.current = { x1: rx, y1: ry, awaitingSecondTap: false, active: true }
      onRulerChange({ x1: rx, y1: ry, x2: rx, y2: ry })
      return
    }
    if (mode === 'router') {
      const p = pointer()
      if (!p || !onSetRouter) return
      onSetRouter({
        x: snap(clamp(p.x, 0, CANVAS_W)),
        y: snap(clamp(p.y, 0, CANVAS_H)),
      })
      return
    }
    if (e.target !== e.target.getStage()) return
    if (mode === 'select') {
      onSelect(null)
      return
    }
    const p = pointer()
    if (!p) return
    const o = { x: snap(clamp(p.x, 0, CANVAS_W)), y: snap(clamp(p.y, 0, CANVAS_H)) }
    setOrigin(o)
    setDraft({ ...o, w: 0, h: 0 })
  }

  const handleMove = () => {
    if (mode === 'ruler' && onRulerChange) {
      const cur = rulerDragRef.current
      if (!cur || (!cur.active && !cur.awaitingSecondTap)) return
      const p = pointer()
      if (!p) return
      onRulerChange({
        x1: cur.x1,
        y1: cur.y1,
        x2: Math.round(clamp(p.x, 0, CANVAS_W)),
        y2: Math.round(clamp(p.y, 0, CANVAS_H)),
      })
      return
    }
    if (!origin) return
    const p = pointer()
    if (!p) return
    const x2 = snap(clamp(p.x, 0, CANVAS_W))
    const y2 = snap(clamp(p.y, 0, CANVAS_H))
    setDraft({
      x: Math.min(origin.x, x2),
      y: Math.min(origin.y, y2),
      w: Math.abs(x2 - origin.x),
      h: Math.abs(y2 - origin.y),
    })
  }

  const handleUp = () => {
    if (mode === 'ruler') {
      const cur = rulerDragRef.current
      if (!cur || !cur.active) return
      const p = pointer()
      if (!p) {
        rulerDragRef.current = null
        return
      }
      const moved = Math.hypot(p.x - cur.x1, p.y - cur.y1)
      rulerDragRef.current = moved < 6
        ? { x1: cur.x1, y1: cur.y1, awaitingSecondTap: true, active: false }
        : null
      return
    }
    if (draft && draft.w >= MIN_ROOM && draft.h >= MIN_ROOM) {
      onSelect(onAdd(draft))
    }
    setOrigin(null)
    setDraft(null)
  }

  const vLines = Array.from({ length: CANVAS_W / 50 + 1 }, (_, i) => i * 50)
  const hLines = Array.from({ length: CANVAS_H / 50 + 1 }, (_, i) => i * 50)

  return (
    <div ref={wrapRef} className="canvas-well w-full">
      <Stage
        ref={stageRef}
        width={width}
        height={CANVAS_H * scale}
        scale={{ x: scale, y: scale }}
        onMouseDown={handleDown}
        onTouchStart={handleDown}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
        onMouseUp={handleUp}
        onTouchEnd={handleUp}
        onMouseLeave={handleUp}
        style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}
      >
        <Layer listening={false}>
          {vLines.map(x => (
            <Line key={`v${x}`} points={[x, 0, x, CANVAS_H]} stroke={c.grid} strokeWidth={1} />
          ))}
          {hLines.map(y => (
            <Line key={`h${y}`} points={[0, y, CANVAS_W, y]} stroke={c.grid} strokeWidth={1} />
          ))}
          <Rect width={CANVAS_W} height={CANVAS_H} stroke={c.line} strokeWidth={1} />
        </Layer>

        <Layer>
          {rooms.map(r => {
            const isSel = r.id === selectedId
            const normalizeTransform = (node: Konva.Node) => {
              const x = snap(clamp(node.x(), 0, CANVAS_W - MIN_ROOM))
              const y = snap(clamp(node.y(), 0, CANVAS_H - MIN_ROOM))
              const w = Math.max(MIN_ROOM, Math.min(CANVAS_W - x, snap(r.w * node.scaleX())))
              const h = Math.max(MIN_ROOM, Math.min(CANVAS_H - y, snap(r.h * node.scaleY())))
              node.scale({ x: 1, y: 1 })
              node.position({ x, y })
              onUpdate(r.id, { x, y, w, h })
            }

            return (
              <Group
                key={r.id}
                id={r.id}
                x={r.x}
                y={r.y}
                draggable={mode === 'select'}
                listening={mode === 'select' || mode === 'draw'}
                onClick={() => onSelect(r.id)}
                onTap={() => onSelect(r.id)}
                onDragMove={e => {
                  const nx = clamp(e.target.x(), 0, CANVAS_W - r.w)
                  const ny = clamp(e.target.y(), 0, CANVAS_H - r.h)
                  e.target.position({ x: nx, y: ny })
                }}
                onDragEnd={e => {
                  const x = snap(clamp(e.target.x(), 0, CANVAS_W - r.w))
                  const y = snap(clamp(e.target.y(), 0, CANVAS_H - r.h))
                  e.target.position({ x, y })
                  onUpdate(r.id, { x, y })
                }}
                onTransform={e => normalizeTransform(e.target)}
                onTransformEnd={e => normalizeTransform(e.target)}
              >
                <Rect
                  width={r.w}
                  height={r.h}
                  fill={c['panel-2']}
                  stroke={isSel ? c.accent : c.wall}
                  strokeWidth={isSel ? 2 : 1.5}
                />
                {(() => {
                  const labelText = r.w >= 145
                    ? `${r.name} · ${(r.w / 50).toFixed(1)}×${(r.h / 50).toFixed(1)}m`
                    : r.name
                  const pillW = Math.max(44, Math.min(r.w - 16, Math.round(labelText.length * 6.9 + 14)))
                  return (
                    <>
                      {r.w >= 60 && r.h >= 36 && (
                        <Rect
                          x={8}
                          y={8}
                          width={pillW}
                          height={22}
                          cornerRadius={6}
                          fill={c.bg}
                          opacity={0.68}
                          listening={false}
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
                        listening={false}
                      />
                    </>
                  )
                })()}
              </Group>
            )
          })}

          {routerPos && (
            <Group x={routerPos.x} y={routerPos.y} listening={false}>
              <Circle radius={24} stroke={c['accent-2']} strokeWidth={1} opacity={0.35} dash={[4, 4]} />
              <Circle radius={8} fill={c.panel} stroke={c['accent-2']} strokeWidth={2.2} />
              <Text
                x={-36}
                y={12}
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

          {draft && (
            <Group listening={false}>
              <Rect
                x={draft.x}
                y={draft.y}
                width={draft.w}
                height={draft.h}
                stroke={c.accent}
                strokeWidth={1.8}
                dash={[6, 4]}
              />
              {draft.w >= 40 && (
                <Text
                  x={draft.x}
                  y={draft.y + draft.h + 6}
                  text={`${(draft.w / 50).toFixed(1)}m × ${(draft.h / 50).toFixed(1)}m`}
                  fill={c.accent}
                  fontSize={11}
                  fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                />
              )}
            </Group>
          )}

          {ruler && rulerMetrics && (
            <Group listening={false}>
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

          <Transformer
            ref={trRef}
            rotateEnabled={false}
            anchorSize={8}
            anchorCornerRadius={2}
            anchorFill={c.panel}
            anchorStroke={c.accent}
            borderStroke={c.accent}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < MIN_ROOM * scale || newBox.height < MIN_ROOM * scale
                ? oldBox
                : newBox
            }
          />
        </Layer>
      </Stage>
    </div>
  )
}
