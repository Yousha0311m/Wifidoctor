// CommandPalette.tsx | SignalFLoor | Global command palette (Ctrl+K) for navigation, themes, exports and resets

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  Bluetooth,
  Command,
  Database,
  Download,
  Flame,
  Gauge,
  LayoutDashboard,
  Map as MapIcon,
  Radar,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react'
import { Modal } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { UI_STYLES, useSettings, type FxPreset, type UiStyle } from '@/hooks/useSettings'
import { sound } from '@/lib/sounds'
import { simulateScan } from '@/lib/scanner'
import { suggestSpots } from '@/lib/spots'
import { toast } from '@/lib/toast'
import { exportTelemetryCsv, exportTelemetryJson, loadDemoWorkspace } from '@/lib/workspace'
import type { ScanPoint } from '@/types'

interface CommandEntry {
  id: string
  title: string
  sub: string
  hint: string
  icon: typeof Command
  run: () => void | Promise<void>
}

function scoreMatch(query: string, text: string): number {
  if (!query) return 100
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx !== -1) return 200 - idx * 2 - (t.length - q.length) * 0.1
  let qi = 0
  let gap = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi += 1
    else gap += 1
  }
  return qi === q.length ? Math.max(10, 120 - gap) : 0
}

export default function CommandPalette({
  open,
  onClose,
  onOpenFxStudio,
  onOpenDevice,
}: {
  open: boolean
  onClose: () => void
  onOpenFxStudio: () => void
  onOpenDevice: () => void
}) {
  const navigate = useNavigate()
  const { rooms, clearRooms } = useFloor()
  const { points, setPoints, clear } = useScan()
  const { settings, updateSettings } = useSettings()

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(timer)
  }, [open])

  const handleClose = () => {
    setQuery('')
    setActiveIdx(0)
    onClose()
  }

  const commands = useMemo<CommandEntry[]>(() => {
    const cyclePreset = () => {
      const order: FxPreset[] = ['carbon', 'grid', 'aura', 'particles', 'embers', 'off']
      const next = order[(order.indexOf(settings.fxPreset) + 1) % order.length]
      updateSettings({ fxPreset: next })
      toast(`Backdrop FX switched to ${next}.`, 'info')
    }

    const autoFillRemaining = async () => {
      if (!rooms.length) {
        toast('Create or load a floor plan first.', 'warn')
        navigate('/floor-plans')
        return
      }
      const todo = suggestSpots(rooms, points).filter(s => !s.done)
      if (!todo.length) {
        toast('All suggested scan spots are already covered.', 'info')
        return
      }
      sound.scan()
      const baseTime = Date.now()
      const batch: ScanPoint[] = []
      for (let idx = 0; idx < todo.length; idx++) {
        const s = todo[idx]
        const r = await simulateScan(s.x, s.y, rooms, 0, settings.routerPos, settings.espSsid)
        batch.push({
          id: baseTime + idx + 1,
          x: s.x,
          y: s.y,
          timestamp: new Date(baseTime + idx * 1000).toISOString(),
          ...r,
        })
      }
      setPoints(ps => [...ps, ...batch])
      toast(`Captured ${batch.length} remaining scan spot(s).`, 'success')
    }

    return [
      { id: 'nav-dash', title: 'Go to Dashboard', sub: 'Signal telemetry & floor overview', hint: 'Nav', icon: LayoutDashboard, run: () => navigate('/') },
      { id: 'nav-floor', title: 'Go to Floor Plans', sub: 'Draw rooms, resize walls & place router', hint: 'Nav', icon: MapIcon, run: () => navigate('/floor-plans') },
      { id: 'nav-scans', title: 'Go to Scans', sub: 'Capture signal readings at spots on your floor plan', hint: 'Nav', icon: Radar, run: () => navigate('/scans') },
      { id: 'nav-heat', title: 'Go to Heatmap', sub: 'Coverage map, dead zones, extenders & report', hint: 'Nav', icon: Flame, run: () => navigate('/heatmap') },
      { id: 'nav-util', title: 'Go to Wi-Fi Utilities', sub: 'Nearby networks, channel congestion & best channel', hint: 'Tools', icon: Gauge, run: () => navigate('/utilities') },
      {
        id: 'demo',
        title: 'Load Demo Home (6 Rooms + 13 Scans)',
        sub: 'Populate complete sample house layout and RSSI telemetry',
        hint: 'Workspace',
        icon: Database,
        run: () => {
          const res = loadDemoWorkspace()
          toast(`Loaded ${res.rooms} rooms and ${res.points} sample scans.`, 'success')
        },
      },
      { id: 'autofill', title: 'Auto-Fill Remaining Scan Spots', sub: 'Sweep all uncovered grid spots across current rooms', hint: 'Scan', icon: Activity, run: autoFillRemaining },
      { id: 'device', title: 'Connect ESP32 over Bluetooth', sub: 'Send Wi-Fi and broker settings to the device', hint: 'Device', icon: Bluetooth, run: onOpenDevice },
      {
        id: 'esp',
        title: settings.scanSource === 'esp32' ? 'Use RF Simulator for Scans' : 'Use ESP32 for Scans',
        sub: settings.scanSource === 'esp32' ? 'Currently reading from the ESP32 scanner' : 'Currently using the built-in simulator',
        hint: 'Device',
        icon: Wifi,
        run: () => {
          const next = settings.scanSource === 'esp32' ? 'simulator' : 'esp32'
          updateSettings({ scanSource: next })
          toast(next === 'esp32' ? 'Scans now come from the ESP32.' : 'Switched to the RF simulator.', 'info')
        },
      },
      { id: 'fx-studio', title: 'Open UI Themes & FX Studio', sub: 'Switch Neumorphism, Liquid Glass, Obsidian Classic & Audio', hint: 'Studio', icon: SlidersHorizontal, run: onOpenFxStudio },
      { id: 'fx-cycle', title: 'Cycle Canvas Physics Preset', sub: `Current preset: ${settings.fxPreset}`, hint: 'FX', icon: Sparkles, run: cyclePreset },
      ...(Object.entries(UI_STYLES) as [UiStyle, (typeof UI_STYLES)[UiStyle]][]).map(([styleKey, meta]) => ({
        id: `ui-${styleKey}`,
        title: `UI Theme: ${meta.label}`,
        sub: meta.desc,
        hint: meta.badge,
        icon: Sparkles,
        run: () => {
          updateSettings({ uiStyle: styleKey })
          toast(`Switched UI theme to ${meta.label}.`, 'info')
        },
      })),
      {
        id: 'mute',
        title: settings.audioEnabled ? 'Mute Micro-Audio FX' : 'Enable Micro-Audio FX',
        sub: 'Toggle synthesized tactile feedback',
        hint: 'Audio',
        icon: settings.audioEnabled ? VolumeX : Volume2,
        run: () => {
          const next = !settings.audioEnabled
          updateSettings({ audioEnabled: next })
          sound.toggle(next)
          toast(next ? 'Micro-audio enabled.' : 'Micro-audio muted.', 'info')
        },
      },
      {
        id: 'exp-csv',
        title: 'Export Scan Points (.csv)',
        sub: `Download ${points.length} RSSI measurement(s)`,
        hint: 'Export',
        icon: Download,
        run: () => {
          if (!points.length) return toast('No scan points to export yet.', 'warn')
          exportTelemetryCsv(points)
          toast('CSV scan export downloaded.', 'success')
        },
      },
      {
        id: 'exp-json',
        title: 'Export Full Diagnostic Report (.json)',
        sub: 'Includes rooms, scans, dead zones & recommendations',
        hint: 'Export',
        icon: Download,
        run: () => {
          exportTelemetryJson(rooms, points)
          toast('Diagnostic JSON report downloaded.', 'success')
        },
      },
      {
        id: 'clear-scans',
        title: 'Clear All Scan Points',
        sub: `Remove ${points.length} saved RSSI reading(s)`,
        hint: 'Reset',
        icon: Trash2,
        run: () => {
          clear()
          toast('Cleared all scan points.', 'info')
        },
      },
      {
        id: 'clear-rooms',
        title: 'Reset Entire Workspace',
        sub: 'Clear all rooms, router placement & scan points',
        hint: 'Reset',
        icon: Trash2,
        run: () => {
          clearRooms()
          clear()
          updateSettings({ routerPos: null })
          toast('Workspace reset to empty state.', 'info')
        },
      },
    ]
  }, [clear, clearRooms, navigate, onOpenDevice, onOpenFxStudio, points, rooms, setPoints, settings.audioEnabled, settings.espSsid, settings.fxPreset, settings.routerPos, settings.scanSource, updateSettings])

  const filtered = useMemo(() => {
    const q = query.trim()
    return commands
      .map(c => ({ c, score: scoreMatch(q, `${c.title} ${c.sub} ${c.hint}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(x => x.c)
  }, [commands, query])

  const execute = (item?: CommandEntry) => {
    if (!item) return
    sound.click()
    handleClose()
    void item.run()
  }

  return (
    <Modal
      open={open}
      title="Command Palette"
      eyebrow="Ctrl+K Quick Jump"
      onClose={handleClose}
      footer={
        <span className="text-[11px] text-[var(--text-3)] mr-auto font-mono">
          Arrows to navigate · Enter to execute · Esc to close
        </span>
      }
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setActiveIdx(0)
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (filtered.length) setActiveIdx(i => (i + 1) % filtered.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (filtered.length) setActiveIdx(i => (i - 1 + filtered.length) % filtered.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            execute(filtered[activeIdx])
          }
        }}
        placeholder="Type a view, scan action, or FX setting…"
        className="input"
      />

      <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-3)] py-6 text-center">No matching commands.</p>
        ) : (
          filtered.map((item, idx) => {
            const Icon = item.icon
            const selected = idx === activeIdx
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => execute(item)}
                style={{
                  background: selected ? 'var(--glass-3)' : 'transparent',
                  borderColor: selected ? 'var(--edge-strong)' : 'transparent',
                }}
                className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left border transition-colors"
              >
                <Icon size={16} className="text-[var(--text-2)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{item.title}</p>
                  <p className="text-xs text-[var(--text-3)] truncate">{item.sub}</p>
                </div>
                <span className="kbd shrink-0">{item.hint}</span>
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}
