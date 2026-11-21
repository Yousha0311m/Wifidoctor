// ConnectDeviceModal.tsx | SignalFLoor | Bluetooth link to the ESP32: send Wi-Fi + broker settings, choose scan source

import { useEffect, useState } from 'react'
import { Bluetooth, BluetoothConnected, Eye, EyeOff, Send, Unplug } from 'lucide-react'
import { Badge, Button, Modal, Switch } from '@/components/ui/Kit'
import { useHardware } from '@/hooks/useHardware'
import { useSettings } from '@/hooks/useSettings'
import { hardware, type DeviceEvent } from '@/lib/hardware'
import { toast } from '@/lib/toast'

const KEY = 'signalfloor.device.v1'

interface Saved {
  ssid: string
  host: string
  port: string
  deviceId: string
}

const DEFAULTS: Saved = { ssid: '', host: '', port: '1883', deviceId: 'esp32-01' }

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Saved>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function describe(e: DeviceEvent): string {
  if (e.evt === 'wifi') {
    if (e.state === 'connecting') return 'Connecting to Wi-Fi...'
    if (e.state === 'connected') return `Wi-Fi connected${e.ip ? ` (${e.ip})` : ''}`
    if (e.state === 'failed') return `Wi-Fi failed${e.reason ? `: ${e.reason}` : ''}`
  }
  if (e.evt === 'mqtt') return e.state === 'connected' ? 'Connected to the broker' : `Broker ${e.state ?? 'update'}`
  return JSON.stringify(e)
}

export default function ConnectDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useHardware()
  const { settings, updateSettings } = useSettings()
  const [form, setForm] = useState<Saved>(loadSaved)
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const support = hardware.support()

  useEffect(() => hardware.onEvent(e => setLog(l => [...l.slice(-5), describe(e)])), [])

  const patch = (p: Partial<Saved>) => {
    const next = { ...form, ...p }
    setForm(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next)) // the password is never stored
    } catch {
      // storage is optional
    }
  }

  const connect = async () => {
    setBusy(true)
    try {
      const ok = await hardware.connect()
      if (ok) toast('Bluetooth connected.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not connect over Bluetooth.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    const port = Number(form.port)
    if (!form.ssid.trim()) return toast('Enter the Wi-Fi network name.', 'warn')
    if (!form.host.trim()) return toast('Enter the broker address (the computer running Mosquitto).', 'warn')
    if (!Number.isInteger(port) || port < 1 || port > 65535) return toast('Broker port must be 1-65535.', 'warn')
    setBusy(true)
    setLog([])
    try {
      await hardware.provision({
        ssid: form.ssid.trim(),
        pass,
        host: form.host.trim(),
        port,
        deviceId: form.deviceId.trim() || DEFAULTS.deviceId,
      })
      toast('Settings sent to the device.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send settings.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Connect Device"
      eyebrow="ESP32 over Bluetooth"
      onClose={onClose}
      footer={
        status.connected ? (
          <Button size="sm" variant="ghost" onClick={() => void hardware.disconnect()}>
            <Unplug size={14} /> Disconnect
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0">
          {status.connected ? <BluetoothConnected size={16} /> : <Bluetooth size={16} />}
          <span className="truncate">{status.connected ? status.deviceName : 'No device connected'}</span>
        </div>
        <Badge tone={status.connected ? 'ok' : 'neutral'}>{status.connected ? 'Connected' : 'Offline'}</Badge>
      </div>

      {!support.ok && (
        <p className="text-xs text-[var(--text-2)] leading-relaxed rounded-[12px] border border-[var(--edge)] p-3">
          {support.reason === 'insecure'
            ? `Bluetooth only works on a secure page. Open the dashboard at http://localhost:5173 on the computer (not the network address ${window.location.host}), in Chrome or Edge.`
            : 'This browser has no Web Bluetooth. Use Chrome or Edge on a computer or Android phone (iPhone and Safari do not support it).'}
        </p>
      )}

      {!status.connected && support.ok && (
        <>
          <p className="text-xs text-[var(--text-2)] leading-relaxed">
            Power the ESP32, then connect. Your browser will list nearby devices named SignalFloor.
          </p>
          <Button variant="primary" onClick={() => void connect()} disabled={busy}>
            <Bluetooth size={14} /> {busy ? 'Connecting...' : 'Connect over Bluetooth'}
          </Button>
        </>
      )}

      {status.connected && (
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-[var(--text-2)]">Wi-Fi network (2.4 GHz only)</label>
          <input
            className="input"
            value={form.ssid}
            onChange={e => patch({ ssid: e.target.value })}
            placeholder="Network name"
            autoCapitalize="none"
            autoCorrect="off"
          />

          <label className="text-xs font-semibold text-[var(--text-2)]">Password</label>
          <div className="relative">
            <input
              className="input pr-11"
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Leave empty for an open network"
              autoComplete="off"
            />
            <button
              type="button"
              className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
              aria-label={showPass ? 'Hide password' : 'Show password'}
              onClick={() => setShowPass(s => !s)}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-2)]">Broker address</label>
              <input
                className="input"
                value={form.host}
                onChange={e => patch({ host: e.target.value })}
                placeholder="192.168.0.10"
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--text-2)]">Port</label>
              <input className="input" value={form.port} onChange={e => patch({ port: e.target.value })} inputMode="numeric" />
            </div>
          </div>

          <label className="text-xs font-semibold text-[var(--text-2)]">Device ID</label>
          <input className="input" value={form.deviceId} onChange={e => patch({ deviceId: e.target.value })} />

          <Button variant="primary" onClick={() => void send()} disabled={busy}>
            <Send size={14} /> Send to device
          </Button>

          {log.length > 0 && (
            <ul className="text-xs font-mono text-[var(--text-2)] flex flex-col gap-1 border-t border-[var(--edge)] pt-2.5">
              {log.map((l, i) => (
                <li key={`${i}-${l}`}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--edge)] pt-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">Use the ESP32 for scans</p>
          <p className="text-xs text-[var(--text-3)]">Off uses the built-in simulator.</p>
        </div>
        <Switch
          checked={settings.scanSource === 'esp32'}
          onChange={on => updateSettings({ scanSource: on ? 'esp32' : 'simulator' })}
          label="Use the ESP32 for scans"
        />
      </div>
    </Modal>
  )
}
