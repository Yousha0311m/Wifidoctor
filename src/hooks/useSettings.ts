// useSettings.ts | SignalFLoor | Persisted Multi-UI Theme, FX Physics, Audio & ESP32 Settings Hook

import { useCallback, useEffect, useRef, useState } from 'react'
import { sound, type AudioPreset } from '@/lib/sounds'

export type UiStyle =
  | 'neumorphism'
  | 'liquid-glass'
  | 'obsidian'
  | 'cyber-carbon'
  | 'te-field'
  | 'aurora-velvet'

export type FxPreset = 'carbon' | 'grid' | 'aura' | 'particles' | 'embers' | 'off'
export type AccentPreset = 'silver' | 'lime' | 'teal' | 'emerald' | 'amber' | 'crimson'

export const UI_STYLES: Record<
  UiStyle,
  {
    label: string
    badge: string
    desc: string
    previewBg: string
    previewCard: string
    previewAccent: string
  }
> = {
  neumorphism: {
    label: 'Neumorphism',
    badge: 'Soft UI',
    desc: 'Extruded dual-shadow matte surfaces & carved inset wells.',
    previewBg: '#1d2128',
    previewCard: '#1d2128',
    previewAccent: '#38bdf8',
  },
  'liquid-glass': {
    label: 'Liquid Glass',
    badge: 'Refractive',
    desc: 'Translucent optical lenses with specular caustics & high saturation.',
    previewBg: '#09111e',
    previewCard: 'rgba(130, 195, 255, 0.16)',
    previewAccent: '#67e8f9',
  },
  obsidian: {
    label: 'Obsidian Classic',
    badge: 'Account UI',
    desc: 'Monochrome smoked glass panels with brushed-silver primary controls.',
    previewBg: '#050506',
    previewCard: 'rgba(255, 255, 255, 0.08)',
    previewAccent: '#fafafa',
  },
  'cyber-carbon': {
    label: 'Cyber Carbon',
    badge: '3K Weave',
    desc: 'Diagonal carbon-fiber weave, sharp 8px geometry & technical rims.',
    previewBg: '#090a0d',
    previewCard: '#111318',
    previewAccent: '#b4f461',
  },
  'te-field': {
    label: 'Field Hardware',
    badge: 'Tactile',
    desc: 'Matte anodized deck, 3D mechanical keycaps & orange triggers.',
    previewBg: '#202124',
    previewCard: '#282a2e',
    previewAccent: '#ff5722',
  },
  'aurora-velvet': {
    label: 'Aurora Velvet',
    badge: 'Ambient',
    desc: 'Deep indigo aurora gradients beneath frosted velvet panels.',
    previewBg: '#070914',
    previewCard: 'rgba(110, 86, 207, 0.18)',
    previewAccent: '#a78bfa',
  },
}

export const ACCENT_PRESETS: Record<AccentPreset, { label: string; hex: string; lightHex: string; hue: number; sat: number }> = {
  silver: { label: 'Monochrome Silver', hex: '#fafafa', lightHex: '#18181b', hue: 220, sat: 12 },
  lime: { label: 'Signal Lime', hex: '#b4f461', lightHex: '#65a30d', hue: 84, sat: 86 },
  teal: { label: 'Cyber Teal', hex: '#5eead4', lightHex: '#0d9488', hue: 170, sat: 76 },
  emerald: { label: 'Emerald Signal', hex: '#34d399', lightHex: '#15803d', hue: 158, sat: 64 },
  amber: { label: 'Amber Beacon', hex: '#fbbf24', lightHex: '#b45309', hue: 38, sat: 88 },
  crimson: { label: 'Crimson Probe', hex: '#f87171', lightHex: '#dc2626', hue: 356, sat: 84 },
}

export type ScanSource = 'simulator' | 'host-wifi' | 'esp32'

export interface SignalSettings {
  uiStyle: UiStyle
  fxPreset: FxPreset
  fxDensity: number
  accentPreset: AccentPreset
  audioEnabled: boolean
  audioPreset: AudioPreset
  audioVolume: number
  audioHoverTicks: boolean
  espConnected: boolean
  scanSource: ScanSource
  espSsid: string
  routerPos: { x: number; y: number } | null
}

const KEY = 'signalfloor.settings.v2'
const EVT = 'signalfloor:settings'

const DEFAULT_SETTINGS: SignalSettings = {
  uiStyle: 'neumorphism',
  fxPreset: 'carbon',
  fxDensity: 0.75,
  accentPreset: 'silver',
  audioEnabled: true,
  audioPreset: 'tactical',
  audioVolume: 0.35,
  audioHoverTicks: false,
  espConnected: false,
  scanSource: 'simulator',
  espSsid: 'HomeNet',
  routerPos: null,
}

function load(): SignalSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SignalSettings>
    const inferredSource: ScanSource = parsed.scanSource ?? (parsed.espConnected ? 'esp32' : 'simulator')
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      scanSource: inferredSource,
      uiStyle: parsed.uiStyle && parsed.uiStyle in UI_STYLES ? parsed.uiStyle : DEFAULT_SETTINGS.uiStyle,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function applyVisualSettings(s: SignalSettings): void {
  const doc = document.documentElement
  doc.setAttribute('data-ui-style', s.uiStyle)

  const acc = ACCENT_PRESETS[s.accentPreset] ?? ACCENT_PRESETS.silver
  const isLight = doc.getAttribute('data-theme') === 'light'
  const col = isLight ? acc.lightHex : acc.hex
  doc.style.setProperty('--accent-h', String(acc.hue))
  doc.style.setProperty('--accent-s', `${acc.sat}%`)
  doc.style.setProperty('--accent', col)
  doc.style.setProperty('--accent-2', s.accentPreset === 'silver' ? (isLight ? '#0d9488' : '#38bdf8') : col)
  doc.style.setProperty('--point-stroke', col)

  sound.configure({
    enabled: s.audioEnabled,
    preset: s.audioPreset,
    volume: s.audioVolume,
    hoverTicks: s.audioHoverTicks,
  })
}

export function useSettings() {
  const [settings, setSettings] = useState<SignalSettings>(() => {
    const init = load()
    applyVisualSettings(init)
    return init
  })
  const ref = useRef<SignalSettings>(settings)

  useEffect(() => {
    ref.current = settings
    sound.init()
    applyVisualSettings(settings)
  }, [settings])

  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<SignalSettings>).detail
      if (detail && detail !== ref.current) {
        ref.current = detail
        setSettings(detail)
      }
    }
    const obs = new MutationObserver(() => applyVisualSettings(load()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener(EVT, onSync)
    return () => {
      window.removeEventListener(EVT, onSync)
      obs.disconnect()
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<SignalSettings>) => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    setSettings(next)
    queueMicrotask(() => {
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
      applyVisualSettings(next)
      window.dispatchEvent(new CustomEvent(EVT, { detail: next }))
    })
  }, [])

  return { settings, updateSettings }
}
