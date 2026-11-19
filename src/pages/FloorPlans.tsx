// FloorPlans.tsx | SignalFLoor | Interactive floorplan builder with continuous draw, quick stamps & router pin
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Camera,
  Copy,
  Database,
  Map as MapIcon,
  MousePointer2,
  Plus,
  RotateCcw,
  Router,
  Ruler,
  Square,
  Trash2,
} from 'lucide-react'
import CameraScannerModal from '@/components/floorplan/CameraScannerModal'
import FloorPlanCanvas, { type Mode } from '@/components/floorplan/FloorPlanCanvas'
import { Badge, Button, ConfirmDialog, GlassCard, Segmented, type SegOption } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useSettings } from '@/hooks/useSettings'
import { measureSpan } from '@/lib/analytics'
import { CANVAS_H, CANVAS_W, clamp, snap } from '@/lib/floor'
import { ROOMS } from '@/lib/mock'
import { getRouterPos } from '@/lib/scanner'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import type { Room, RulerMeasurement } from '@/types'

const NAME_PRESETS = ['Living Room', 'Bedroom', 'Kitchen', 'Study', 'Hall', 'Bath', 'Office', 'Garage']

interface QuickPreset {
  name: string
  wM: number
  hM: number
  label: string
}

const QUICK_PRESETS: QuickPreset[] = [
  { name: 'Living Room', wM: 5.0, hM: 4.0, label: 'Living (5×4m)' },
  { name: 'Bedroom', wM: 4.0, hM: 3.5, label: 'Bedroom (4×3.5m)' },
  { name: 'Kitchen', wM: 3.5, hM: 3.0, label: 'Kitchen (3.5×3m)' },
  { name: 'Bathroom', wM: 2.5, hM: 2.0, label: 'Bath (2.5×2m)' },
  { name: 'Office', wM: 3.0, hM: 2.5, label: 'Office (3×2.5m)' },
  { name: 'Hallway', wM: 4.0, hM: 1.5, label: 'Hall (4×1.5m)' },
]

const MODE_OPTIONS: SegOption<Mode>[] = [
  { value: 'draw', label: 'Draw room (D)', icon: <Square size={14} /> },
  { value: 'select', label: 'Select & resize (V)', icon: <MousePointer2 size={14} /> },
  { value: 'router', label: 'Place router (R)', icon: <Router size={14} /> },
  { value: 'ruler', label: 'Measure (M)', icon: <Ruler size={14} /> },
]

export default function FloorPlans() {
  const { rooms, setRooms, addRoom, updateRoom, removeRoom, clearRooms } = useFloor()
  const { settings, updateSettings } = useSettings()

  const [mode, setMode] = useState<Mode>('draw')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [ruler, setRuler] = useState<RulerMeasurement | null>(null)

  const selected = rooms.find(r => r.id === selectedId) ?? null
  const activeRouter = getRouterPos(rooms, settings.routerPos)

  const rulerMetrics = useMemo(() => {
    if (!ruler || Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) < 4) return null
    return measureSpan(ruler.x1, ruler.y1, ruler.x2, ruler.y2, rooms)
  }, [ruler, rooms])

  const handleCameraAddRoom = (name: string, widthMeters: number, depthMeters: number) => {
    const w = Math.max(80, Math.min(CANVAS_W - 80, Math.round((widthMeters * 50) / 10) * 10))
    const h = Math.max(80, Math.min(CANVAS_H - 80, Math.round((depthMeters * 50) / 10) * 10))
    const maxRight = rooms.reduce((m, r) => Math.max(m, r.x + r.w), 80)
    const x = maxRight + w <= CANVAS_W - 40 ? maxRight : 80
    const y = maxRight + w <= CANVAS_W - 40 ? 80 : 320
    const id = addRoom({ name, x, y, w, h })
    setSelectedId(id)
    toast(`Added camera-scanned "${name}" (${widthMeters.toFixed(1)}×${depthMeters.toFixed(1)}m).`, 'success')
  }

  const handleQuickAdd = (preset: QuickPreset) => {
    const w = Math.round(preset.wM * 50)
    const h = Math.round(preset.hM * 50)
    let x = 60
    let y = 60

    if (rooms.length > 0) {
      const lastRoom = rooms[rooms.length - 1]
      const candidateX = lastRoom.x + lastRoom.w + 10
      if (candidateX + w <= CANVAS_W - 30) {
        x = candidateX
        y = lastRoom.y
      } else {
        const lowestY = rooms.reduce((max, r) => Math.max(max, r.y + r.h), 60)
        x = 60
        y = lowestY + 10 <= CANVAS_H - h - 30 ? lowestY + 10 : 60
      }
    }

    const count = rooms.filter(r => r.name.startsWith(preset.name)).length
    const name = count === 0 ? preset.name : `${preset.name} ${count + 1}`
    const id = addRoom({ name, x, y, w, h })
    setSelectedId(id)
    sound.success()
    toast(`Added "${name}" (${preset.wM}×${preset.hM}m). Click handles to resize or drag to position.`, 'success')
  }

  const handleDuplicate = useCallback(
    (room: Room) => {
      const offset = 20
      const x = Math.min(CANVAS_W - room.w, snap(room.x + offset))
      const y = Math.min(CANVAS_H - room.h, snap(room.y + offset))
      const match = room.name.match(/^(.*?)(?:\s+(\d+))?$/)
      const baseName = match ? match[1] : room.name
      const count = rooms.filter(r => r.name.startsWith(baseName)).length
      const name = `${baseName} ${count + 1}`
      const id = addRoom({ name, x, y, w: room.w, h: room.h })
      setSelectedId(id)
      sound.success()
      toast(`Duplicated "${name}".`, 'success')
    },
    [addRoom, rooms],
  )

  const remove = (id: string) => {
    removeRoom(id)
    setSelectedId(null)
    toast('Room removed.', 'info')
  }

  // Keyboard navigation & blueprint shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault()
          removeRoom(selectedId)
          setSelectedId(null)
          toast('Room removed.', 'info')
        }
        return
      }

      if (e.key === 'Escape') {
        setSelectedId(null)
        return
      }

      // Duplicate shortcut Ctrl+D
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (selected) {
          e.preventDefault()
          handleDuplicate(selected)
        }
        return
      }

      // Tool switching
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          setMode('draw')
          toast('Draw tool active — drag on canvas to create rooms.', 'info')
        } else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') {
          e.preventDefault()
          setMode('select')
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          setMode('router')
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault()
          setMode('ruler')
        }
      }

      // Arrow keys to nudge selected room
      if (selected && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 50 : 10
        let nx = selected.x
        let ny = selected.y
        if (e.key === 'ArrowUp') ny = clamp(selected.y - step, 0, CANVAS_H - selected.h)
        if (e.key === 'ArrowDown') ny = clamp(selected.y + step, 0, CANVAS_H - selected.h)
        if (e.key === 'ArrowLeft') nx = clamp(selected.x - step, 0, CANVAS_W - selected.w)
        if (e.key === 'ArrowRight') nx = clamp(selected.x + step, 0, CANVAS_W - selected.w)
        updateRoom(selected.id, { x: nx, y: ny })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selected, removeRoom, updateRoom, handleDuplicate])

  const totalSqm = rooms.reduce((s, r) => s + (r.w / 50) * (r.h / 50), 0)

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Floor Plans</h1>
          <p>Draw continuous rooms on the 10px snap grid, stamp quick presets, or pin your Wi-Fi router.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setCameraOpen(true)}>
            <Camera size={14} /> Scan Room (Camera)
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setRooms(ROOMS)
              setSelectedId(null)
              toast(`Loaded ${ROOMS.length} sample rooms.`, 'success')
            }}
          >
            <Database size={14} /> Sample Layout
          </Button>
          {rooms.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
              <Trash2 size={14} /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* Mode & Action Toolbar */}
      <div className="toolbar glass">
        <div className="tb-row">
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />

          <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-3)] flex-wrap">
            {mode === 'ruler' ? (
              <>
                {rulerMetrics ? (
                  <span className="font-mono text-[var(--text)]">
                    {rulerMetrics.meters.toFixed(2)}m · {rulerMetrics.steps} steps · {rulerMetrics.wallsCrossed} wall(s) · -{rulerMetrics.estLossDb} dB loss
                  </span>
                ) : (
                  <span>Drag or tap two points to measure distance &amp; wall loss</span>
                )}
                {ruler && (
                  <Button size="sm" variant="ghost" onClick={() => setRuler(null)}>
                    Clear
                  </Button>
                )}
              </>
            ) : (
              <span className="font-mono hidden sm:inline">
                {mode === 'draw'
                  ? 'Continuous Draw active · drag to add rooms · press V to select'
                  : mode === 'router'
                    ? 'Click anywhere to position router origin'
                    : 'Drag room to move · handles to resize · Arrows to nudge · Del to delete'}
              </span>
            )}
          </div>
        </div>

        {/* Quick Room Stamper Bar */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--edge)] overflow-x-auto text-xs">
          <span className="text-[var(--text-3)] font-semibold uppercase text-[10px] tracking-wider shrink-0 mr-1">
            Quick Add:
          </span>
          {QUICK_PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => handleQuickAdd(p)}
              className="chip hover:border-[var(--edge-strong)] cursor-pointer shrink-0 transition-colors inline-flex items-center gap-1"
            >
              <Plus size={11} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3.5 items-start">
        <GlassCard
          eyebrow="Canvas"
          title="Spatial Layout Editor"
          sub={`${rooms.length} room(s) · ${totalSqm.toFixed(1)} m² total`}
          icon={<MapIcon size={17} />}
        >
          <FloorPlanCanvas
            rooms={rooms}
            selectedId={selectedId}
            mode={mode}
            routerPos={rooms.length > 0 || settings.routerPos ? activeRouter : null}
            ruler={ruler}
            onSelect={id => {
              // Select room for inspection, but do NOT kick out of draw mode if drawing!
              setSelectedId(id)
            }}
            onAdd={rect => {
              sound.success()
              const id = addRoom(rect)
              setSelectedId(id)
              toast('Room added! Drag again to add another room, or press V to select.', 'success')
              return id
            }}
            onUpdate={updateRoom}
            onSetRouter={pos => {
              sound.click()
              updateSettings({ routerPos: pos })
              setMode('select')
              toast(`Router pinned at (${pos.x}, ${pos.y}).`, 'success')
            }}
            onRulerChange={setRuler}
          />
        </GlassCard>

        {/* Unified Layout & Inspector Panel */}
        <div className="flex flex-col gap-3.5">
          {/* Active Room Inspector */}
          {selected ? (
            <GlassCard
              eyebrow="Inspector"
              title={selected.name}
              action={
                <Badge tone="neutral">
                  {(selected.w / 50).toFixed(1)}×{(selected.h / 50).toFixed(1)}m
                </Badge>
              }
            >
              <div className="flex flex-col gap-2.5">
                <label className="text-xs font-semibold text-[var(--text-2)]">Room Name</label>
                <input
                  value={selected.name}
                  onChange={e => updateRoom(selected.id, { name: e.target.value })}
                  className="input"
                  placeholder="e.g. Living Room, Bedroom"
                />

                <div className="flex flex-wrap gap-1.5">
                  {NAME_PRESETS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        sound.click()
                        updateRoom(selected.id, { name: p })
                      }}
                      className="chip cursor-pointer hover:border-[var(--edge-strong)]"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-[var(--text-3)] font-mono flex justify-between pt-1 border-t border-[var(--edge)]">
                  <span>
                    Area: {(((selected.w / 50) * selected.h) / 50).toFixed(1)} m²
                  </span>
                  <span>
                    Pos: ({selected.x}, {selected.y})
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => handleDuplicate(selected)}>
                    <Copy size={13} /> Duplicate (Ctrl+D)
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(selected.id)}>
                    <Trash2 size={13} /> Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                    Deselect
                  </Button>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard eyebrow="Inspector" title="Room Details">
              <p className="text-xs text-[var(--text-3)] leading-relaxed">
                Click any room on the canvas to inspect dimensions, rename, duplicate, or delete.
              </p>
            </GlassCard>
          )}

          {/* Rooms Inventory */}
          <GlassCard
            eyebrow="Layout"
            title={`Rooms (${rooms.length})`}
            action={<Badge tone="neutral">{totalSqm.toFixed(1)} m²</Badge>}
          >
            {rooms.length === 0 ? (
              <div className="text-xs text-[var(--text-3)] flex flex-col gap-3 py-2">
                <p>No rooms created yet. Use Quick Add above, drag on the canvas, or load a sample house.</p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setRooms(ROOMS)
                    toast('Sample 6-room home loaded.', 'success')
                  }}
                >
                  Load Sample Layout
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                {rooms.map(r => (
                  <li key={r.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => {
                        sound.click()
                        setSelectedId(r.id)
                      }}
                      style={{
                        background: r.id === selectedId ? 'var(--glass-3)' : 'transparent',
                        borderColor: r.id === selectedId ? 'var(--edge-strong)' : 'transparent',
                      }}
                      className="flex-1 flex justify-between items-center px-3 py-2 rounded-[10px] text-sm border text-left transition-colors"
                    >
                      <span className="truncate font-medium text-[var(--text)]">{r.name}</span>
                      <span className="font-mono text-[11px] text-[var(--text-3)]">
                        {(r.w / 50).toFixed(1)}×{(r.h / 50).toFixed(1)}m
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        remove(r.id)
                      }}
                      title="Remove room"
                      className="p-1.5 text-[var(--text-3)] hover:text-[var(--err-text)] rounded-[6px] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Router status inline footer */}
            <div className="mt-3 pt-3 border-t border-[var(--edge)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-[var(--text-2)]">
                <Router size={13} className="text-[var(--accent-2)]" />
                <span>Router: ({activeRouter.x}, {activeRouter.y})</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMode('router')
                    toast('Click anywhere on canvas to place router.', 'info')
                  }}
                >
                  Move
                </Button>
                {settings.routerPos && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      updateSettings({ routerPos: null })
                      toast('Router reset to auto center.', 'info')
                    }}
                  >
                    <RotateCcw size={12} /> Auto
                  </Button>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <CameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onAddRoom={handleCameraAddRoom}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset Floor Layout?"
        message="Remove all rooms from the canvas? Saved scan points will stay unless cleared on the Scans tab."
        confirmLabel="Reset Floor"
        danger
        onConfirm={() => {
          clearRooms()
          setSelectedId(null)
          updateSettings({ routerPos: null })
          toast('Cleared all rooms.', 'info')
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  )
}
