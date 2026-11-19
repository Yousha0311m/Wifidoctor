// sounds.ts | SignalFLoor | Procedural tactile ASMR & sonar-ping presets for UI actions

import { playFilteredNoise, playTone, setAudioOptions, unlockAudio } from './audio'

export type AudioPreset = 'tactical' | 'subtle' | 'off'

const HOVER_COOLDOWN_MS = 48 // cap rapid cursor hover chatter

const state = {
  enabled: true,
  preset: 'tactical' as AudioPreset,
  volume: 0.35,
  hoverTicks: false,
  lastHoverAt: 0,
  initialized: false,
}

function active(): boolean {
  return state.enabled && state.preset !== 'off' && state.volume > 0.001
}

function gainScale(): number {
  return state.preset === 'subtle' ? 0.55 : 1
}

export const sound = {
  init(): void {
    if (state.initialized) return
    state.initialized = true
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock, { passive: true })
  },

  configure(opts: {
    enabled?: boolean
    preset?: AudioPreset
    volume?: number
    hoverTicks?: boolean
  }): void {
    if (typeof opts.enabled === 'boolean') state.enabled = opts.enabled
    if (opts.preset) state.preset = opts.preset
    if (opts.volume !== undefined) state.volume = opts.volume
    if (typeof opts.hoverTicks === 'boolean') state.hoverTicks = opts.hoverTicks
    setAudioOptions({
      isEnabled: state.enabled && state.preset !== 'off',
      level: state.volume,
    })
  },

  tick(): void {
    if (!active() || !state.hoverTicks) return
    const now = performance.now()
    if (now - state.lastHoverAt < HOVER_COOLDOWN_MS) return
    state.lastHoverAt = now
    const m = gainScale()
    playFilteredNoise({ filterFreq: 3200, q: 3.4, dur: 0.014, gain: 0.04 * m })
  },

  click(): void {
    if (!active()) return
    const m = gainScale()
    playFilteredNoise({ filterFreq: 2250, q: 2.1, dur: 0.022, gain: 0.1 * m })
    playTone({ freq: 245, endFreq: 98, type: 'triangle', dur: 0.032, gain: 0.11 * m, attack: 0.002 })
  },

  toggle(on: boolean): void {
    if (!active()) return
    const m = gainScale()
    playFilteredNoise({ filterFreq: on ? 2600 : 1650, q: 2.6, dur: 0.018, gain: 0.08 * m })
    playTone({ freq: on ? 420 : 320, endFreq: on ? 620 : 210, type: 'sine', dur: 0.055, gain: 0.11 * m })
  },

  open(): void {
    if (!active()) return
    const m = gainScale()
    playFilteredNoise({ filterType: 'lowpass', filterFreq: 1100, q: 1, dur: 0.08, gain: 0.075 * m })
    playTone({ freq: 280, endFreq: 420, type: 'sine', dur: 0.09, gain: 0.08 * m })
  },

  close(): void {
    if (!active()) return
    const m = gainScale()
    playTone({ freq: 340, endFreq: 190, type: 'sine', dur: 0.07, gain: 0.07 * m })
  },

  scan(): void {
    if (!active()) return
    const m = gainScale()
    playFilteredNoise({ filterFreq: 2800, q: 2.5, dur: 0.03, gain: 0.1 * m })
    playTone({ freq: 560, endFreq: 980, type: 'sine', dur: 0.11, gain: 0.11 * m })
    playTone({ freq: 980, endFreq: 1240, type: 'sine', dur: 0.12, gain: 0.06 * m, delay: 0.07 })
  },

  success(): void {
    if (!active()) return
    const m = gainScale()
    playTone({ freq: 523.25, endFreq: 523.25, type: 'sine', dur: 0.1, gain: 0.09 * m })
    playTone({ freq: 659.25, endFreq: 659.25, type: 'sine', dur: 0.14, gain: 0.09 * m, delay: 0.065 })
  },

  error(): void {
    if (!active()) return
    const m = gainScale()
    playTone({ freq: 165, endFreq: 110, type: 'triangle', dur: 0.12, gain: 0.14 * m })
    playTone({ freq: 130, endFreq: 95, type: 'sine', dur: 0.14, gain: 0.1 * m, delay: 0.06 })
  },
}
