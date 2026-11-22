// Topbar.tsx | SignalFLoor | Header bar with UI theme pill, command palette, audio & theme toggle
import { useLocation } from 'react-router-dom'
import { Bluetooth, BluetoothConnected, Command, Palette, Volume2, VolumeX } from 'lucide-react'
import { useFloor } from '@/hooks/useFloor'
import { useHardware } from '@/hooks/useHardware'
import { useScan } from '@/hooks/useScan'
import { UI_STYLES, useSettings } from '@/hooks/useSettings'
import { sound } from '@/lib/sounds'
import ThemeToggle from './ThemeToggle'

const ROUTE_SUB: Record<string, string> = {
  '/': 'Wi-Fi Telemetry Studio',
  '/floor-plans': 'Spatial Floor Builder',
  '/scans': 'Signal Capture',
  '/heatmap': 'Signal Heatmap',
  '/reports': 'Dead-Zone Diagnostics',
  '/utilities': 'Channels & Nearby Networks',
}

export default function Topbar({
  onOpenCommand,
  onOpenThemeStudio,
  onOpenDevice,
}: {
  onOpenCommand: () => void
  onOpenThemeStudio: () => void
  onOpenDevice: () => void
}) {
  const { pathname } = useLocation()
  const { rooms } = useFloor()
  const { points } = useScan()
  const { settings, updateSettings } = useSettings()
  const device = useHardware()

  const avg = points.length ? Math.round(points.reduce((s, p) => s + p.rssi, 0) / points.length) : null
  const activeStyle = UI_STYLES[settings.uiStyle] ?? UI_STYLES.neumorphism

  return (
    <header className="titlebar">
      <div className="tb-drag">
        <img src="/android-chrome-192x192.png" height={52} width={52}/>
        <span className="tb-title">Wifi Mama</span>
        <span className="tb-sub">{ROUTE_SUB[pathname] ?? 'Wi-Fi Telemetry'} · by Geymars</span>
      </div>

      <div className="tb-right">
        <button
          type="button"
          className="tb-pill interactive"
          onClick={() => {
            sound.click()
            onOpenDevice()
          }}
          title={device.connected ? `Connected: ${device.deviceName}` : 'Connect the ESP32 over Bluetooth'}
        >
          {device.connected ? <BluetoothConnected size={13} /> : <Bluetooth size={13} />}
          <span className={`conn-dot ${device.connected ? 'ok' : ''}`} />
          <span className="hidden md:inline">{device.connected ? 'Device' : 'Connect'}</span>
        </button>

        <button
          type="button"
          className="tb-pill interactive"
          onClick={() => {
            sound.click()
            onOpenThemeStudio()
          }}
          title="Switch UI Design Theme (Neumorphism, Liquid Glass, Obsidian, etc.)"
        >
          <Palette size={13} />
          <span className="hidden sm:inline">{activeStyle.label}</span>
        </button>

        <button
          type="button"
          className="tb-pill interactive"
          onClick={onOpenCommand}
          title="Open Command Palette (Ctrl+K)"
        >
          <Command size={13} />
          <span className="hidden lg:inline">Commands</span>
          <span className="kbd">Ctrl+K</span>
        </button>

        <span className="tb-pill hidden xl:inline-flex" title="Mapped rooms & scan captures">
          <span className="font-mono text-xs">
            {rooms.length} room{rooms.length === 1 ? '' : 's'} · {points.length} scan{points.length === 1 ? '' : 's'}
            {avg !== null ? ` · ${avg} dBm` : ''}
          </span>
        </span>

        <button
          type="button"
          className="tb-pill interactive"
          onClick={() => {
            const next = !settings.audioEnabled
            sound.toggle(next)
            updateSettings({ audioEnabled: next })
          }}
          aria-label="Toggle micro-audio"
          title={settings.audioEnabled ? 'Mute micro-audio' : 'Enable micro-audio'}
        >
          {settings.audioEnabled && settings.audioPreset !== 'off' ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        <ThemeToggle />
      </div>
    </header>
  )
}
