// FloorPlanCanvas.tsx | SignalFLoor | Touch-friendly Konva floorplan editor (draw, select/resize, router pin)

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Stage, Layer, Rect, Text, Group, Line, Circle, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { Room } from '@/types'
import { CANVAS_W, CANVAS_H, MIN_ROOM, snap, clamp } from '@/lib/floor'
import { useCanvasColors } from '@/hooks/useCanvasColors'

export type Mode = 'select' | 'draw' | 'router'

interface Rect4 { x: number; y: number; w: number; h: number }

interface Props {
  rooms: Room[]
  selectedId: string | null
  mode: Mode
  routerPos?: { x: number; y: number } | null
  onSelect: (id: string | null) => void
  onAdd: (rect: Rect4) => string
  onUpdate: (id: string, patch: Partial<Room>) => void
  onSetRouter?: (pos: { x: number; y: number }) => void
}

export default function FloorPlanCanvas({
  rooms,
  selectedId,
  mode,
  routerPos,
  onSelect,
  onAdd,
  onUpdate,
  onSetRouter,
}: Props) {
  const c = useCanvasColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)

  const [width, setWidth] = useState(CANVAS_W)
  const [draft, setDraft] = useState<Rect4 | null>(null)
  // The gesture lives in a ref so the lift-off handler never reads stale state
  const drawRef = useRef<{ pointerId: number; origin: { x: number; y: number } } | null>(null)

  const scale = width / CANVAS_W

  // Bigger resize handles when the primary input is a finger
  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(200, Math.floor(entry.contentRect.width)))
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

  // Position of a pointer event in canvas units (1000 x 600), plus raw stage pixels for hit testing
  const locate = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return null
    const box = stage.container().getBoundingClientRect()
    const px = e.clientX - box.left
    const py = e.clientY - box.top
    return {
      px,
      py,
      x: clamp(px / scale, 0, CANVAS_W),
      y: clamp(py / scale, 0, CANVAS_H),
    }
  }

  const rectFrom = (o: { x: number; y: number }, x: number, y: number): Rect4 => {
    const x2 = snap(x)
    const y2 = snap(y)
    return {
      x: Math.min(o.x, x2),
      y: Math.min(o.y, y2),
      w: Math.abs(x2 - o.x),
      h: Math.abs(y2 - o.y),
    }
  }

  // All canvas gestures go through native pointer events on the wrapper. Pointer capture guarantees
  // we receive the lift-off (pointerup) or pointercancel, which is what finishes a room on touch screens.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const stage = stageRef.current
    const at = locate(e)
    if (!stage || !at) return
    const hit = stage.getIntersection({ x: at.px, y: at.py })

    if (mode === 'router') {
      onSetRouter?.({ x: snap(at.x), y: snap(at.y) })
      return
    }
    if (mode === 'select') {
      if (!hit) onSelect(null)
      return
    }
    // draw mode: starting on an existing room just selects it (handled by the room itself)
    if (hit) return

    const origin = { x: snap(at.x), y: snap(at.y) }
    drawRef.current = { pointerId: e.pointerId, origin }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture is best effort
    }
    setDraft({ ...origin, w: 0, h: 0 })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drawRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const at = locate(e)
    if (!at) return
    setDraft(rectFrom(d.origin, at.x, at.y))
  }

  const finishDraw = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drawRef.current
    if (!d || e.pointerId !== d.pointerId) return
    // Clear the gesture first so the outline can never get stuck, whatever happens next
    drawRef.current = null
    setDraft(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    if (!commit) return
    const at = locate(e)
    if (!at) return
    const rect = rectFrom(d.origin, at.x, at.y)
    if (rect.w >= MIN_ROOM && rect.h >= MIN_ROOM) onSelect(onAdd(rect))
  }

  const vLines = Array.from({ length: CANVAS_W / 50 + 1 }, (_, i) => i * 50)
  const hLines = Array.from({ length: CANVAS_H / 50 + 1 }, (_, i) => i * 50)

  return (
    <div
      ref={wrapRef}
      className="canvas-well w-full"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => finishDraw(e, true)}
      onPointerCancel={e => finishDraw(e, false)}
      // touch-action: none stops the page from scrolling while a finger draws or drags on the canvas.
      // Without it the browser cancels the gesture mid-drag and the new room never gets committed.
      style={{ touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={CANVAS_H * scale}
        scale={{ x: scale, y: scale }}
        style={{ cursor: mode === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
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

            const pillW = Math.max(44, Math.min(r.w - 16, Math.round(r.name.length * 6.9 + 14)))

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
                  text={r.name}
                  fill={c.ink}
                  opacity={0.92}
                  fontSize={11}
                  fontStyle="bold"
                  ellipsis
                  wrap="none"
                  fontFamily="Cascadia Mono, Consolas, ui-monospace, monospace"
                  listening={false}
                />
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
            <Rect
              x={draft.x}
              y={draft.y}
              width={draft.w}
              height={draft.h}
              stroke={c.accent}
              strokeWidth={1.8}
              dash={[6, 4]}
              listening={false}
            />
          )}

          <Transformer
            ref={trRef}
            rotateEnabled={false}
            anchorSize={coarse ? 18 : 8}
            anchorCornerRadius={coarse ? 4 : 2}
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