// CameraScannerModal.tsx | SignalFLoor | WebRTC/photo camera room scanner & pitch-trig distance measurer with 1-click room creation

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  Compass,
  Pause,
  Play,
  PlusSquare,
  Ruler,
  Upload,
} from 'lucide-react'
import { Badge, Button, Modal, Segmented, type SegOption } from '@/components/ui/Kit'
import { sound } from '@/lib/sounds'
import { toast } from '@/lib/toast'

type CalMode = 'reticle' | 'trig'
type HandleKey = 'r1' | 'r2' | 'w1' | 'w2' | 'd1' | 'd2'

interface Pt {
  x: number // normalized 0..100
  y: number // normalized 0..100
}

const PRESET_REFS = [
  { label: 'Door (0.90m)', meters: 0.9 },
  { label: 'Tile (0.60m)', meters: 0.6 },
  { label: 'Desk (1.40m)', meters: 1.4 },
  { label: 'Step (0.75m)', meters: 0.75 },
]

const ROOM_NAME_SUGGESTIONS = ['Bedroom', 'Living Room', 'Office', 'Kitchen', 'Bath', 'Hall']

const MODE_OPTIONS: SegOption<CalMode>[] = [
  { value: 'reticle', label: 'Visual Scale Reticle', icon: <Ruler size={13} /> },
  { value: 'trig', label: 'Pitch Laser Trig', icon: <Compass size={13} /> },
]

export default function CameraScannerModal({
  open,
  onClose,
  onAddRoom,
  onMeasureDistance,
}: {
  open: boolean
  onClose: () => void
  onAddRoom?: (name: string, widthMeters: number, depthMeters: number) => void
  onMeasureDistance?: (meters: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [calMode, setCalMode] = useState<CalMode>('reticle')
  const [camState, setCamState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [camMessage, setCamMessage] = useState<string>('Start live camera or snap a room photo to measure.')
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null)

  // Normalized 0..100 reticle endpoints over 16:9 frame
  const [pts, setPts] = useState<Record<HandleKey, Pt>>({
    r1: { x: 14, y: 26 },
    r2: { x: 26, y: 26 },
    w1: { x: 18, y: 54 },
    w2: { x: 82, y: 54 },
    d1: { x: 48, y: 36 },
    d2: { x: 48, y: 78 },
  })
  const [dragging, setDragging] = useState<HandleKey | null>(null)
  const [refMeters, setRefMeters] = useState(0.9)

  // Pitch trig mode state
  const [eyeHeightM, setEyeHeightM] = useState(1.45)
  const [tiltDeg, setTiltDeg] = useState(64) // deg from straight down (10..84)
  const [imuActive, setImuActive] = useState(false)
  const [lockedWidthM, setLockedWidthM] = useState(4.2)
  const [lockedDepthM, setLockedDepthM] = useState(3.6)

  const [roomName, setRoomName] = useState('Scanned Room')

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('error')
      setCamMessage(
        window.isSecureContext
          ? 'Camera API unavailable on this device. Use Snap / Upload Photo instead.'
          : 'Live camera requires HTTPS on LAN phones. Tap Snap / Upload Photo to launch your native camera.',
      )
      return
    }
    setCamState('starting')
    setFrozenUrl(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCamState('live')
      setCamMessage('Live camera feed active.')
    } catch (err) {
      setCamState('error')
      setCamMessage(
        err instanceof Error
          ? `${err.message} — use Snap / Upload Photo to measure from your camera.`
          : 'Unable to open live camera. Use Snap / Upload Photo instead.',
      )
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopStream()
      return
    }
    return () => {
      stopStream()
    }
  }, [open, stopStream])

  useEffect(() => {
    if (!open || !imuActive) return
    const onOrient = (e: DeviceOrientationEvent) => {
      if (typeof e.beta !== 'number') return
      const clamped = Math.max(10, Math.min(84, Math.round(e.beta)))
      setTiltDeg(clamped)
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [open, imuActive])

  const freezeFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const c = document.createElement('canvas')
    c.width = video.videoWidth
    c.height = video.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setFrozenUrl(c.toDataURL('image/jpeg', 0.9))
    stopStream()
    setCamState('idle')
    sound.click()
  }

  const handlePhotoFile = (file?: File) => {
    if (!file) return
    stopStream()
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFrozenUrl(reader.result)
        setCamState('idle')
        sound.click()
        toast('Photo loaded into measurement reticle.', 'success')
      }
    }
    reader.readAsDataURL(file)
  }

  // Reticle span math (weighted 16:9 aspect correction)
  const reticleDims = useMemo(() => {
    const dist = (a: Pt, b: Pt) => Math.hypot((b.x - a.x) * 1.777, b.y - a.y)
    const refPx = Math.max(4, dist(pts.r1, pts.r2))
    const wPx = dist(pts.w1, pts.w2)
    const dPx = dist(pts.d1, pts.d2)
    const wMeters = +Math.max(0.6, Math.min(20, (wPx / refPx) * refMeters)).toFixed(2)
    const dMeters = +Math.max(0.6, Math.min(14, (dPx / refPx) * refMeters)).toFixed(2)
    return { wMeters, dMeters }
  }, [pts, refMeters])

  const liveTrigDist = useMemo(() => {
    const rad = (tiltDeg * Math.PI) / 180
    return +Math.max(0.4, Math.min(25, eyeHeightM * Math.tan(rad))).toFixed(2)
  }, [eyeHeightM, tiltDeg])

  const finalWidth = calMode === 'reticle' ? reticleDims.wMeters : lockedWidthM
  const finalDepth = calMode === 'reticle' ? reticleDims.dMeters : lockedDepthM
  const areaSqm = +(finalWidth * finalDepth).toFixed(1)

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const nx = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100))
    const ny = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100))
    setPts(prev => ({ ...prev, [dragging]: { x: +nx.toFixed(1), y: +ny.toFixed(1) } }))
  }

  const toggleImu = async () => {
    const devOrient = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    if (!imuActive && typeof devOrient.requestPermission === 'function') {
      try {
        const perm = await devOrient.requestPermission()
        if (perm !== 'granted') {
          toast('Tilt sensor permission declined — use the manual angle slider.', 'warn')
          return
        }
      } catch {
        toast('Unable to read tilt permission — use the angle slider.', 'warn')
        return
      }
    }
    sound.toggle(!imuActive)
    setImuActive(a => !a)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      eyebrow="Optical Spatial Measurer"
      title="Camera Room Scanner & Distance Estimator"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {onMeasureDistance && (
            <Button
              onClick={() => {
                sound.click()
                onMeasureDistance(calMode === 'trig' ? liveTrigDist : finalWidth)
                toast(
                  `Applied measured span ${(calMode === 'trig' ? liveTrigDist : finalWidth).toFixed(2)} m.`,
                  'success',
                )
              }}
            >
              <Ruler size={14} /> Use Span ({(calMode === 'trig' ? liveTrigDist : finalWidth).toFixed(2)}m)
            </Button>
          )}
          {onAddRoom && (
            <Button
              variant="primary"
              onClick={() => {
                sound.success()
                onAddRoom(roomName, finalWidth, finalDepth)
                onClose()
              }}
            >
              <PlusSquare size={14} /> Add {finalWidth.toFixed(1)}×{finalDepth.toFixed(1)}m Room
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented options={MODE_OPTIONS} value={calMode} onChange={setCalMode} />

        <div className="flex items-center gap-2 flex-wrap">
          {camState === 'live' ? (
            <Button size="sm" onClick={freezeFrame}>
              <Pause size={13} /> Freeze Frame
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={startCamera}>
              <Play size={13} /> {frozenUrl ? 'Resume Live Camera' : 'Start Live Camera'}
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => handlePhotoFile(e.target.files?.[0])}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} /> Snap / Upload Photo
          </Button>
        </div>
      </div>

      {/* Viewport with SVG reticle / laser overlay */}
      <div className="relative w-full aspect-video rounded-[14px] overflow-hidden border border-[var(--edge-strong)] bg-black/75 select-none">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover ${camState === 'live' ? 'block' : 'hidden'}`}
        />

        {frozenUrl && camState !== 'live' && (
          <img src={frozenUrl} alt="Captured room frame" className="w-full h-full object-cover" />
        )}

        {camState !== 'live' && !frozenUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-950/90 to-slate-900/80">
            <Camera size={32} className="text-[var(--accent)] mb-2 opacity-85" />
            <p className="text-sm font-medium text-[var(--text)] max-w-md">{camMessage}</p>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Works on live webcam, mobile rear camera photos, or interactive reticle preview right here.
            </p>
          </div>
        )}

        {calMode === 'reticle' ? (
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full touch-none"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            {/* Reference calibration segment (cyan) */}
            <line
              x1={pts.r1.x}
              y1={pts.r1.y}
              x2={pts.r2.x}
              y2={pts.r2.y}
              stroke="#38bdf8"
              strokeWidth="0.7"
              strokeDasharray="1.5 1"
            />
            <text
              x={(pts.r1.x + pts.r2.x) / 2}
              y={Math.min(pts.r1.y, pts.r2.y) - 2.2}
              textAnchor="middle"
              fill="#38bdf8"
              fontSize="3.1"
              fontFamily="monospace"
              fontWeight="bold"
            >
              REF {refMeters.toFixed(2)}m
            </text>

            {/* Width segment (emerald) */}
            <line x1={pts.w1.x} y1={pts.w1.y} x2={pts.w2.x} y2={pts.w2.y} stroke="#34d399" strokeWidth="0.85" />
            <text
              x={(pts.w1.x + pts.w2.x) / 2}
              y={(pts.w1.y + pts.w2.y) / 2 - 2.2}
              textAnchor="middle"
              fill="#34d399"
              fontSize="3.4"
              fontFamily="monospace"
              fontWeight="bold"
            >
              WIDTH {reticleDims.wMeters.toFixed(2)}m
            </text>

            {/* Depth segment (amber) */}
            <line x1={pts.d1.x} y1={pts.d1.y} x2={pts.d2.x} y2={pts.d2.y} stroke="#fbbf24" strokeWidth="0.85" />
            <text
              x={(pts.d1.x + pts.d2.x) / 2 + 2.5}
              y={(pts.d1.y + pts.d2.y) / 2}
              fill="#fbbf24"
              fontSize="3.4"
              fontFamily="monospace"
              fontWeight="bold"
            >
              DEPTH {reticleDims.dMeters.toFixed(2)}m
            </text>

            {(
              [
                ['r1', '#38bdf8'],
                ['r2', '#38bdf8'],
                ['w1', '#34d399'],
                ['w2', '#34d399'],
                ['d1', '#fbbf24'],
                ['d2', '#fbbf24'],
              ] as [HandleKey, string][]
            ).map(([k, color]) => (
              <circle
                key={k}
                cx={pts[k].x}
                cy={pts[k].y}
                r="2.1"
                fill="#090d14"
                stroke={color}
                strokeWidth="0.85"
                style={{ cursor: 'grab' }}
                onPointerDown={e => {
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  setDragging(k)
                }}
              />
            ))}
          </svg>
        ) : (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-2 border-[var(--accent)]/80 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            </div>
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 border border-white/15 font-mono text-xs text-white">
              AIM CROSSHAIR AT WALL FLOOR BASE · {liveTrigDist.toFixed(2)} m
            </div>
          </div>
        )}
      </div>

      {/* Controls & Calculated Room Specs */}
      {calMode === 'reticle' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text)]">Reference Object Scale (Cyan Bar)</span>
              <span className="font-mono text-[var(--accent)]">{refMeters.toFixed(2)} m</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REFS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    sound.click()
                    setRefMeters(p.meters)
                  }}
                  className={`chip cursor-pointer ${Math.abs(refMeters - p.meters) < 0.01 ? 'ok' : ''}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[var(--text-3)]">
              Drag the cyan endpoints onto a known object (like a 0.90m door frame), then align green &amp; amber bars to room width &amp; depth.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text)]">Target Room Name</span>
              <Badge tone="ok">{areaSqm} m²</Badge>
            </div>
            <input
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              className="input"
              placeholder="Bedroom, Living Room, Office..."
            />
            <div className="flex flex-wrap gap-1.5">
              {ROOM_NAME_SUGGESTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    sound.click()
                    setRoomName(n)
                  }}
                  className="chip cursor-pointer hover:border-[var(--edge-strong)]"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text)]">Trigonometric Laser Height &amp; Pitch</span>
              <Button size="sm" onClick={toggleImu}>
                <Compass size={12} /> {imuActive ? 'Phone Tilt Live' : 'Use Phone Tilt'}
              </Button>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-2)]">Camera Height (h)</span>
              <input
                type="range"
                min={0.8}
                max={2.1}
                step={0.05}
                value={eyeHeightM}
                onChange={e => setEyeHeightM(parseFloat(e.target.value))}
                className="w-36"
              />
              <span className="font-mono text-[var(--text)] w-14 text-right">{eyeHeightM.toFixed(2)} m</span>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-2)]">Downward Pitch (θ)</span>
              <input
                type="range"
                min={15}
                max={84}
                step={1}
                value={tiltDeg}
                onChange={e => setTiltDeg(parseInt(e.target.value, 10))}
                className="w-36"
              />
              <span className="font-mono text-[var(--text)] w-14 text-right">{tiltDeg}°</span>
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  sound.tick()
                  setLockedWidthM(liveTrigDist)
                }}
              >
                <Check size={12} /> Lock Width ({liveTrigDist.toFixed(2)}m)
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  sound.tick()
                  setLockedDepthM(liveTrigDist)
                }}
              >
                <Check size={12} /> Lock Depth ({liveTrigDist.toFixed(2)}m)
              </Button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/25 border border-[var(--edge)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text)]">Locked Room Dimensions</span>
              <span className="font-mono text-[var(--accent)]">
                {finalWidth.toFixed(2)}m × {finalDepth.toFixed(2)}m ({areaSqm} m²)
              </span>
            </div>
            <input
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              className="input"
              placeholder="Room name"
            />
            <p className="text-[var(--text-3)]">
              Stand against one wall, point the camera crosshair at the base of the opposite wall, and lock Width and Depth.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
