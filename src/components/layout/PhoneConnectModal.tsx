// PhoneConnectModal.tsx | SignalFLoor | LAN host QR companion modal, real Windows netsh telemetry & live sync

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw, Smartphone, UploadCloud, DownloadCloud, Wifi } from 'lucide-react'
import { Badge, Button, Modal } from '@/components/ui/Kit'
import { useFloor } from '@/hooks/useFloor'
import { useScan } from '@/hooks/useScan'
import { useSettings } from '@/hooks/useSettings'
import {
  fetchLanInfo,
  fetchLanState,
  loadOperator,
  pushLanState,
  saveOperator,
  type LanInfoResponse,
} from '@/lib/lan'
import { generateQrMatrix, qrMatrixToSvgPath } from '@/lib/qr'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'
import type { Room, ScanPoint } from '@/types'

export default function PhoneConnectModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { rooms, setRooms } = useFloor()
  const { points, setPoints } = useScan()
  const { settings, updateSettings } = useSettings()

  const [info, setInfo] = useState<LanInfoResponse | null>(null)
  const [selectedUrlIdx, setSelectedUrlIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetchLanInfo()
    if (res) setInfo(res)
  }, [])

  useEffect(() => {
    if (!open) return
    const t0 = setTimeout(() => void refresh(), 20)
    const id = setInterval(() => void refresh(), 3000)
    return () => {
      clearTimeout(t0)
      clearInterval(id)
    }
  }, [open, refresh])

  const urls = info?.urls ?? []
  const baseUrl = urls[selectedUrlIdx] ?? urls[0] ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
  const companionUrl = `${baseUrl}/scans?companion=1`

  const qrSvg = useMemo(() => {
    const matrix = generateQrMatrix(companionUrl)
    return qrMatrixToSvgPath(matrix, 2)
  }, [companionUrl])

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(companionUrl)
      setCopied(true)
      sound.click()
      toast('Copied phone companion URL.', 'success')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('Copy failed — highlight and copy manually.', 'warn')
    }
  }

  const pushToLan = async () => {
    setSyncing(true)
    try {
      const op = loadOperator()
      const res = await pushLanState({
        rooms,
        points,
        routerPos: settings.routerPos,
        operator: op,
      })
      if (res) {
        sound.success()
        toast(`Pushed ${rooms.length} room(s) & ${points.length} scan(s) to LAN bridge (rev ${res.revision}).`, 'success')
        void refresh()
      } else {
        toast('LAN sync API unreachable (run via start.bat / Vite dev server).', 'warn')
      }
    } finally {
      setSyncing(false)
    }
  }

  const pullFromLan = async () => {
    setSyncing(true)
    try {
      const res = await fetchLanState()
      if (!res) {
        toast('LAN sync API unreachable.', 'warn')
        return
      }
      if (Array.isArray(res.rooms)) setRooms(res.rooms as Room[])
      if (Array.isArray(res.points)) setPoints(res.points as ScanPoint[])
      if (res.routerPos !== undefined) updateSettings({ routerPos: res.routerPos })
      if (res.operator) saveOperator(res.operator)
      sound.success()
      toast(`Synced from LAN bridge (revision ${res.revision}).`, 'success')
    } finally {
      setSyncing(false)
    }
  }

  const wifi = info?.wifi
  const isHostMode = settings.scanSource === 'host-wifi'

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      eyebrow="Local Wi-Fi Bridge"
      title="Connect Phone & Host Wi-Fi Telemetry"
      footer={
        <>
          <Button size="sm" onClick={() => void refresh()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] gap-4 items-start">
        {/* QR Code Card */}
        <div className="p-3.5 rounded-2xl bg-black/25 border border-[var(--edge)] flex flex-col items-center gap-2.5 text-center">
          <div className="p-2.5 rounded-xl bg-white shadow-inner">
            <svg
              width={176}
              height={176}
              viewBox={`0 0 ${qrSvg.viewSize} ${qrSvg.viewSize}`}
              shapeRendering="crispEdges"
              aria-label={`QR Code for ${companionUrl}`}
            >
              <rect width={qrSvg.viewSize} height={qrSvg.viewSize} fill="#ffffff" />
              <path d={qrSvg.path} fill="#090a0d" />
            </svg>
          </div>
          <p className="text-[11px] text-[var(--text-2)] leading-snug">
            Scan with your phone camera while connected to the same Wi-Fi network.
          </p>
          <Button size="sm" className="w-full" onClick={copyUrl}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied URL' : 'Copy Companion Link'}
          </Button>
        </div>

        {/* Network URLs, Live Wi-Fi Telemetry & Sync */}
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="text-[var(--accent)]" />
                <span className="text-xs font-semibold text-[var(--text)]">LAN Server Addresses</span>
              </div>
              <Badge tone={urls.length ? 'ok' : 'warn'}>
                {urls.length ? `${urls.length} adapter(s)` : 'localhost only'}
              </Badge>
            </div>

            {urls.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {urls.map((u, idx) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      sound.click()
                      setSelectedUrlIdx(idx)
                    }}
                    className={`chip font-mono cursor-pointer ${idx === selectedUrlIdx ? 'ok' : ''}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-3)]">
                Run via <span className="font-mono">start.bat</span> (or <span className="font-mono">npm.cmd run dev -- --host</span>) so your Wi-Fi IP is bound for phones.
              </p>
            )}

            <p className="font-mono text-[11px] text-[var(--text-2)] break-all bg-black/30 px-2.5 py-1.5 rounded-lg border border-[var(--edge)]">
              {companionUrl}
            </p>
          </div>

          {/* Host Windows Wi-Fi Card */}
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-[var(--accent-2)]" />
                <span className="text-xs font-semibold text-[var(--text)]">Live Host Wi-Fi Adapter</span>
              </div>
              <Badge tone={wifi?.connected ? 'ok' : 'neutral'}>
                {wifi?.connected ? `${wifi.rssi} dBm (${wifi.signalPct}%)` : 'Not detected'}
              </Badge>
            </div>

            {wifi?.connected ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] text-[var(--text-2)]">
                <div>SSID: <span className="text-[var(--text)]">{wifi.ssid}</span></div>
                <div>Channel: <span className="text-[var(--text)]">{wifi.channel ?? 'Auto'}</span></div>
                <div>Link: <span className="text-[var(--text)]">{wifi.rxRateMbps ?? '-'} Mbps</span></div>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-3)]">
                No active Windows WLAN adapter reading available — RF Simulator remains ready.
              </p>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button
                size="sm"
                variant={isHostMode ? 'primary' : 'default'}
                onClick={() => {
                  const next = isHostMode ? 'simulator' : 'host-wifi'
                  sound.toggle(next === 'host-wifi')
                  updateSettings({
                    scanSource: next,
                    espConnected: false,
                    ...(wifi?.ssid ? { espSsid: wifi.ssid } : {}),
                  })
                  toast(
                    next === 'host-wifi'
                      ? 'Switched scans to Live Host Wi-Fi (netsh).'
                      : 'Switched back to RF Simulator.',
                    next === 'host-wifi' ? 'success' : 'info',
                  )
                }}
              >
                <Wifi size={13} /> {isHostMode ? 'Host Wi-Fi Active' : 'Use Host Wi-Fi for Scans'}
              </Button>
            </div>
          </div>

          {/* Sync Bridge Controls */}
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text)]">
                Workspace Sync Bridge · Rev {info?.revision ?? 0}
              </span>
              <span className="font-mono text-[11px] text-[var(--text-3)]">
                {info?.clients?.length ?? 0} active client(s)
              </span>
            </div>
            {info && info.clients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {info.clients.map(c => (
                  <Badge key={c.id} tone="ok">
                    {c.deviceName} ({c.role})
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" disabled={syncing} onClick={pushToLan}>
                <UploadCloud size={13} /> Push Layout to Phone
              </Button>
              <Button size="sm" disabled={syncing} onClick={pullFromLan}>
                <DownloadCloud size={13} /> Pull Phone Scans
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
