// FloorPlans.tsx | SignalFLoor | Floorplan builder: continuous draw, quick stamps, router pin (touch friendly)
import { useCallback, useEffect, useState } from 'react'
import {
  Copy,
  Database,
  Map as MapIcon,
  MousePointer2,
  Plus,
  RotateCcw,
  Router,
  Square,
  Trash2,
} from 'lucide-react'
import FloorPlanCanvas, { type Mode } from '@/components/floorplan/FloorPlanCanvas'
import { Badge, Button, ConfirmDialog, GlassCard, Segmented, type SegOption } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useSettings } from '@/hooks/useSettings'
import { CANVAS_H, CANVAS_W, clamp, snap } from '@/lib/floor'
import { ROOMS } from '@/lib/mock'
import { getRouterPos } from '@/lib/scanner'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import type { Room } from '@/types'

const NAME_PRESETS = ['Living Room', 'Bedroom', 'Kitchen', 'Study', 'Hall', 'Bath', 'Office', 'Garage']

interface QuickPreset {
  name: string
  w: number
  h: number
  label: string
}

// Sizes are canvas pixels (the canvas is 1000 x 600)
const QUICK_PRESETS: QuickPreset[] = [
  { name: 'Living Room', w: 250, h: 200, label: 'Living' },
  { name: 'Bedroom', w: 200, h: 180, label: 'Bedroom' },
  { name: 'Kitchen', w: 170, h: 150, label: 'Kitchen' },
  { name: 'Bathroom', w: 120, h: 100, label: 'Bath' },
  { name: 'Office', w: 150, h: 120, label: 'Office' },
  { name: 'Hallway', w: 200, h: 80, label: 'Hall' },
]

const MODE_OPTIONS: SegOption<Mode>[] = [
  { value: 'draw', label: 'Draw', icon: <Square size={14} /> },
  { value: 'select', label: 'Select', icon: <MousePointer2 size={14} /> },
  { value: 'router', label: 'Router', icon: <Router size={14} /> },
]

const MODE_HINT: Record<Mode, string> = {
  draw: 'Drag on the canvas to add a room. Keep drawing to add more.',
  select: 'Tap a room to select it. Drag to move, drag the handles to resize.',
  router: 'Tap the canvas to place the router.',
}

export default function FloorPlans() {
  const { rooms, setRooms, addRoom, updateRoom, removeRoom, clearRooms } = useFloor()
  const { settings, updateSettings } = useSettings()

  const [mode, setMode] = useState<Mode>('draw')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const selected = rooms.find(r => r.id === selectedId) ?? null
  const activeRouter = getRouterPos(rooms, settings.routerPos)

  const handleQuickAdd = (preset: QuickPreset) => {
    const { w, h } = preset
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
    toast(`Added "${name}". Switch to Select to move or resize it.`, 'success')
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

  // Keyboard shortcuts (desktop only)
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

      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (selected) {
          e.preventDefault()
          handleDuplicate(selected)
        }
        return
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          setMode('draw')
        } else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') {
          e.preventDefault()
          setMode('select')
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          setMode('router')
        }
      }

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

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Floor Plans</h1>
          <p>Draw rooms on the snap grid, stamp quick presets, or pin your Wi-Fi router.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <p className="text-xs text-[var(--text-3)] basis-full sm:basis-0 sm:flex-1 sm:text-right">
            {MODE_HINT[mode]}
          </p>
        </div>

        {/* Quick Room Stamper Bar */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--edge)] overflow-x-auto text-xs">
          <span className="text-[var(--text-3)] font-semibold uppercase text-[10px] tracking-wider shrink-0 mr-1">
            Quick Add
          </span>
          {QUICK_PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => handleQuickAdd(p)}
              className="chip hover:border-[var(--edge-strong)] cursor-pointer shrink-0 transition-colors inline-flex items-center gap-1 !h-8 sm:!h-[22px]"
            >
              <Plus size={11} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3.5 items-start">
        <GlassCard
          eyebrow="Canvas"
          title="Spatial Layout Editor"
          sub={`${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
          icon={<MapIcon size={17} />}
        >
          <FloorPlanCanvas
            rooms={rooms}
            selectedId={selectedId}
            mode={mode}
            routerPos={rooms.length > 0 || settings.routerPos ? activeRouter : null}
            onSelect={setSelectedId}
            onAdd={rect => {
              const id = addRoom(rect)
              setSelectedId(id)
              try {
                sound.success()
              } catch {
                // audio is optional, never block adding a room
              }
              return id
            }}
            onUpdate={updateRoom}
            onSetRouter={pos => {
              sound.click()
              updateSettings({ routerPos: pos })
              setMode('select')
              toast(`Router pinned at (${pos.x}, ${pos.y}).`, 'success')
            }}
          />
        </GlassCard>

        {/* Inspector & room list */}
        <div className="flex flex-col gap-3.5">
          {selected ? (
            <GlassCard
              eyebrow="Inspector"
              title={selected.name}
              action={
                <Badge tone="neutral">
                  {selected.w}×{selected.h}
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
                    Size: {selected.w}×{selected.h}
                  </span>
                  <span>
                    Pos: ({selected.x}, {selected.y})
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button size="sm" onClick={() => handleDuplicate(selected)}>
                    <Copy size={13} /> Duplicate
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
                Select a room to rename, duplicate or delete it.
              </p>
            </GlassCard>
          )}

          {/* Rooms Inventory */}
          <GlassCard eyebrow="Layout" title={`Rooms (${rooms.length})`}>
            {rooms.length === 0 ? (
              <div className="text-xs text-[var(--text-3)] flex flex-col gap-3 py-2">
                <p>No rooms yet. Use Quick Add, drag on the canvas, or load a sample house.</p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setRooms(ROOMS)
                    toast('Sample home loaded.', 'success')
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
                        {r.w}×{r.h}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        remove(r.id)
                      }}
                      title="Remove room"
                      className="p-2 text-[var(--text-3)] hover:text-[var(--err-text)] rounded-[6px] transition-colors md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Router status */}
            <div className="mt-3 pt-3 border-t border-[var(--edge)] flex items-center justify-between text-xs flex-wrap gap-2">
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
                    toast('Tap the canvas to place the router.', 'info')
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