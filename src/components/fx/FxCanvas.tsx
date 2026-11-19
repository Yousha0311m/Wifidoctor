// FxCanvas.tsx | SignalFLoor | 60 FPS pooled Float32Array backdrop physics reacting to pointer motion

import { useEffect, useRef } from 'react'
import { ACCENT_PRESETS, useSettings } from '@/hooks/useSettings'

const MAX_NODES = 96 // fixed pool ceiling for zero per-frame heap allocation
const DPR_CAP = 2

export default function FxCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { settings } = useSettings()

  const optsRef = useRef({
    preset: settings.fxPreset,
    density: settings.fxDensity,
    hue: ACCENT_PRESETS[settings.accentPreset]?.hue ?? 84,
    sat: ACCENT_PRESETS[settings.accentPreset]?.sat ?? 86,
  })

  useEffect(() => {
    const acc = ACCENT_PRESETS[settings.accentPreset] ?? ACCENT_PRESETS.lime
    optsRef.current = {
      preset: settings.fxPreset,
      density: settings.fxDensity,
      hue: acc.hue,
      sat: acc.sat,
    }
  }, [settings.fxPreset, settings.fxDensity, settings.accentPreset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const px = new Float32Array(MAX_NODES)
    const py = new Float32Array(MAX_NODES)
    const vx = new Float32Array(MAX_NODES)
    const vy = new Float32Array(MAX_NODES)
    const sz = new Float32Array(MAX_NODES)
    const ph = new Float32Array(MAX_NODES)

    let width = 1280
    let height = 720
    let raf = 0
    let lastT = 0
    let pointerX = -9999
    let pointerY = -9999
    let smoothX = -9999
    let smoothY = -9999
    let seeded = false

    const seed = () => {
      for (let i = 0; i < MAX_NODES; i++) {
        px[i] = Math.random() * width
        py[i] = Math.random() * height
        vx[i] = (Math.random() - 0.5) * 16
        vy[i] = (Math.random() - 0.5) * 16
        sz[i] = 1 + Math.random() * 1.6
        ph[i] = Math.random() * Math.PI * 2
      }
      seeded = true
    }

    const resize = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1)
      width = Math.max(1, window.innerWidth)
      height = Math.max(1, window.innerHeight)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!seeded) seed()
    }

    const activeCount = () => {
      const ratio = Math.max(0.25, Math.min(1.5, optsRef.current.density || 0.75))
      return Math.min(MAX_NODES, Math.max(14, Math.floor(52 * ratio)))
    }

    const frame = (now: number) => {
      raf = 0
      const { preset, hue, sat } = optsRef.current
      if (document.hidden || preset === 'off' || reduced?.matches) {
        ctx.clearRect(0, 0, width, height)
        return
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - (lastT || now)) / 1000))
      lastT = now
      const t = now / 1000
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      const lightness = isLight ? 40 : 72

      if (pointerX > 0) {
        if (smoothX < 0) {
          smoothX = pointerX
          smoothY = pointerY
        } else {
          smoothX += (pointerX - smoothX) * Math.min(1, dt * 10)
          smoothY += (pointerY - smoothY) * Math.min(1, dt * 10)
        }
      }

      ctx.clearRect(0, 0, width, height)
      const count = activeCount()

      if (preset === 'grid') {
        const step = 52
        ctx.strokeStyle = `hsla(${hue} ${sat}% ${lightness}% / ${isLight ? 0.055 : 0.045})`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = (t * 5) % step; x < width; x += step) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let y = (t * 3.5) % step; y < height; y += step) {
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        ctx.stroke()

        if (smoothX > 0) {
          const g = ctx.createRadialGradient(smoothX, smoothY, 0, smoothX, smoothY, 210)
          g.addColorStop(0, `hsla(${hue} ${sat}% ${lightness}% / ${isLight ? 0.09 : 0.11})`)
          g.addColorStop(1, 'transparent')
          ctx.fillStyle = g
          ctx.fillRect(smoothX - 210, smoothY - 210, 420, 420)
        }
        for (let i = 0; i < count; i += 2) {
          ctx.fillStyle = `hsla(${hue} ${sat}% ${lightness}% / 0.16)`
          ctx.fillRect(px[i], py[i], 2, 2)
        }
      } else if (preset === 'aura') {
        const cx = smoothX > 0 ? smoothX : width * 0.55 + Math.cos(t * 0.25) * 140
        const cy = smoothY > 0 ? smoothY : height * 0.45 + Math.sin(t * 0.22) * 90
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 320)
        g.addColorStop(0, `hsla(${hue} ${sat}% ${lightness}% / 0.12)`)
        g.addColorStop(0.5, `hsla(${hue} ${sat}% ${lightness}% / 0.035)`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, width, height)
      } else if (preset === 'particles') {
        const linkDist2 = 115 * 115
        for (let i = 0; i < count; i++) {
          px[i] += vx[i] * dt * 0.7
          py[i] += vy[i] * dt * 0.7
          if (px[i] < 0 || px[i] > width) vx[i] *= -1
          if (py[i] < 0 || py[i] > height) vy[i] *= -1
          px[i] = Math.max(0, Math.min(width, px[i]))
          py[i] = Math.max(0, Math.min(height, py[i]))
          ctx.fillStyle = `hsla(${hue} ${sat}% ${lightness}% / 0.26)`
          ctx.fillRect(px[i] - 1, py[i] - 1, 2.2, 2.2)
        }
        ctx.lineWidth = 1
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            const dx = px[i] - px[j]
            const dy = py[i] - py[j]
            const d2 = dx * dx + dy * dy
            if (d2 < linkDist2) {
              const a = (1 - Math.sqrt(d2) / 115) * 0.14
              ctx.strokeStyle = `hsla(${hue} ${sat}% ${lightness}% / ${a.toFixed(3)})`
              ctx.beginPath()
              ctx.moveTo(px[i], py[i])
              ctx.lineTo(px[j], py[j])
              ctx.stroke()
            }
          }
        }
      } else if (preset === 'embers') {
        for (let i = 0; i < count; i++) {
          py[i] -= (14 + sz[i] * 8) * dt
          px[i] += Math.sin(t * 1.8 + ph[i]) * 12 * dt
          if (py[i] < -10) {
            py[i] = height + 10
            px[i] = Math.random() * width
          }
          const alpha = 0.12 + 0.16 * (1 - py[i] / height)
          ctx.fillStyle = `hsla(${hue} ${Math.max(20, sat)}% ${lightness}% / ${alpha.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(px[i], py[i], sz[i] * 0.9, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        if (smoothX > 0) {
          const g = ctx.createRadialGradient(smoothX, smoothY, 4, smoothX, smoothY, 240)
          g.addColorStop(0, `hsla(${hue} ${sat}% ${lightness}% / 0.095)`)
          g.addColorStop(1, 'transparent')
          ctx.fillStyle = g
          ctx.fillRect(smoothX - 240, smoothY - 240, 480, 480)
        }
        for (let i = 0; i < count; i++) {
          px[i] += vx[i] * dt * 0.45
          py[i] += vy[i] * dt * 0.45
          if (px[i] < 0) px[i] += width
          else if (px[i] > width) px[i] -= width
          if (py[i] < 0) py[i] += height
          else if (py[i] > height) py[i] -= height

          let boost = 0
          if (smoothX > 0) {
            const dx = smoothX - px[i]
            const dy = smoothY - py[i]
            const d2 = dx * dx + dy * dy
            if (d2 < 32400) boost = 1 - Math.sqrt(d2) / 180
          }
          const alpha = 0.08 + boost * 0.28 + Math.sin(t * 1.4 + ph[i]) * 0.03
          ctx.fillStyle = `hsla(${hue} ${sat}% ${lightness}% / ${alpha.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(px[i], py[i], sz[i] + boost * 1.1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(frame)
    }

    const kick = () => {
      if (optsRef.current.preset === 'off' || reduced?.matches || document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
        ctx.clearRect(0, 0, width, height)
        return
      }
      if (!raf) {
        lastT = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const onMove = (e: PointerEvent) => {
      pointerX = e.clientX
      pointerY = e.clientY
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('signalfloor:settings', kick)
    document.addEventListener('visibilitychange', kick)
    resize()
    kick()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', resize)
      window.removeEventListener('signalfloor:settings', kick)
      document.removeEventListener('visibilitychange', kick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  )
}
