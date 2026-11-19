// audio.ts | SignalFLoor | Procedural Web Audio synthesizer engine with gesture unlock and gain safety

type AudioCtxCtor = typeof AudioContext

interface WinWithWebkit extends Window {
  webkitAudioContext?: AudioCtxCtor
}

const SAMPLE_NOISE_SECS = 0.4 // filtered white-noise buffer length in seconds

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let enabled = true
let volume = 0.35

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0))
}

function buildNoise(audioCtx: AudioContext, secs: number): AudioBuffer {
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * secs))
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    ch[i] = Math.random() * 2 - 1
  }
  return buf
}

function ensureCtx(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const win = window as WinWithWebkit
    const Ctor = window.AudioContext || win.webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = clamp(volume, 0, 1)
      master.connect(ctx.destination)
      noiseBuf = buildNoise(ctx, SAMPLE_NOISE_SECS)
    } catch {
      ctx = null
      return null
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

export function unlockAudio(): void {
  ensureCtx()
}

export function setAudioOptions(opts: { isEnabled?: boolean; level?: number }): void {
  if (typeof opts.isEnabled === 'boolean') enabled = opts.isEnabled
  if (opts.level !== undefined) volume = clamp(opts.level, 0, 1)
  if (master && ctx) {
    master.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.015)
  }
}

export function playTone(opts: {
  freq?: number
  endFreq?: number
  type?: OscillatorType
  dur?: number
  gain?: number
  attack?: number
  delay?: number
}): void {
  const c = ensureCtx()
  if (!c || !master || volume <= 0.001) return
  const freq = Math.max(30, opts.freq ?? 440)
  const dur = opts.dur ?? 0.08
  const gain = opts.gain ?? 0.14
  const attack = opts.attack ?? 0.004
  const now = c.currentTime + (opts.delay ?? 0)

  const osc = c.createOscillator()
  const env = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, now)
  if (opts.endFreq && opts.endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, opts.endFreq), now + dur)
  }
  env.gain.setValueAtTime(0.0001, now)
  env.gain.linearRampToValueAtTime(gain, now + Math.min(attack, dur * 0.4))
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(env)
  env.connect(master)
  osc.start(now)
  osc.stop(now + dur + 0.015)
}

export function playFilteredNoise(opts: {
  filterFreq?: number
  q?: number
  filterType?: BiquadFilterType
  dur?: number
  gain?: number
  delay?: number
}): void {
  const c = ensureCtx()
  if (!c || !master || !noiseBuf || volume <= 0.001) return
  const now = c.currentTime + (opts.delay ?? 0)
  const dur = opts.dur ?? 0.035
  const src = c.createBufferSource()
  src.buffer = noiseBuf

  const flt = c.createBiquadFilter()
  flt.type = opts.filterType ?? 'bandpass'
  flt.frequency.setValueAtTime(opts.filterFreq ?? 2000, now)
  flt.Q.setValueAtTime(opts.q ?? 2.2, now)

  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, now)
  env.gain.linearRampToValueAtTime(opts.gain ?? 0.1, now + 0.002)
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur)

  src.connect(flt)
  flt.connect(env)
  env.connect(master)
  src.start(now)
  src.stop(now + dur + 0.015)
}
