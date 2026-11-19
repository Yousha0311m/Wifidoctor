// FxStudioModal.tsx | SignalFLoor | UI Theme Gallery, Backdrop Physics & ASMR Audio Studio Modal

import { Check, Palette, Play, Radar, SlidersHorizontal, Volume2 } from 'lucide-react'
import { Badge, Button, Modal, Switch } from '@/components/ui/Kit'
import {
  ACCENT_PRESETS,
  UI_STYLES,
  useSettings,
  type AccentPreset,
  type FxPreset,
  type UiStyle,
} from '@/hooks/useSettings'
import { sound, type AudioPreset } from '@/lib/sounds'
import { toast } from '@/lib/toast'

const FX_OPTIONS: { value: FxPreset; label: string }[] = [
  { value: 'carbon', label: 'Carbon Weave' },
  { value: 'grid', label: 'Tactical RF Grid' },
  { value: 'aura', label: 'Soft Aura' },
  { value: 'particles', label: 'Constellation' },
  { value: 'embers', label: 'Signal Embers' },
  { value: 'off', label: 'Off (Static)' },
]

const AUDIO_OPTIONS: { value: AudioPreset; label: string }[] = [
  { value: 'tactical', label: 'Tactical (Crisp)' },
  { value: 'subtle', label: 'Subtle (Whisper)' },
  { value: 'off', label: 'Off' },
]

export default function FxStudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, updateSettings } = useSettings()

  return (
    <Modal
      open={open}
      title="UI Themes & FX Studio"
      eyebrow="SignalFloor Appearance"
      wide
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-2 mb-1">
            <Palette size={15} /> UI Design Architecture
          </p>
          <p className="text-xs text-[var(--text-3)] mb-3">
            Switch between tactile Soft UI (Neumorphism), optical Liquid Glass, classic Obsidian Glass, Carbon, and Hardware styles.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(Object.entries(UI_STYLES) as [UiStyle, (typeof UI_STYLES)[UiStyle]][]).map(([key, item]) => {
              const active = settings.uiStyle === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    sound.click()
                    updateSettings({ uiStyle: key })
                    toast(`UI Theme set to ${item.label}.`, 'info')
                  }}
                  style={{
                    background: active ? 'var(--glass-3)' : 'var(--glass-1)',
                    borderColor: active ? 'var(--edge-strong)' : 'var(--edge)',
                  }}
                  className="p-3 rounded-[14px] border text-left flex flex-col gap-2 transition-colors hover:border-[var(--edge-strong)]"
                >
                  <div
                    className="h-9 w-full rounded-[9px] p-1.5 flex items-center justify-between border border-white/10"
                    style={{ background: item.previewBg }}
                  >
                    <div
                      className="h-5 w-16 rounded-[6px] border border-white/10"
                      style={{ background: item.previewCard }}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.previewAccent }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text)] truncate">{item.label}</span>
                    <Badge tone={active ? 'ok' : 'neutral'}>{active ? 'Active' : item.badge}</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-3)] leading-snug">{item.desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <SlidersHorizontal size={14} /> Canvas Physics Preset
            </p>
            <p className="text-xs text-[var(--text-3)]">60 FPS Float32Array backdrop reacting subtly to pointer velocity.</p>
          </div>
          <select
            value={settings.fxPreset}
            onChange={e => updateSettings({ fxPreset: e.target.value as FxPreset })}
            className="select"
            style={{ width: 200 }}
          >
            {FX_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Particle Density</p>
            <p className="text-xs text-[var(--text-3)]">Scale active nodes ({Math.round(settings.fxDensity * 100)}%).</p>
          </div>
          <input
            type="range"
            min={0.25}
            max={1.5}
            step={0.25}
            value={settings.fxDensity}
            onChange={e => updateSettings({ fxDensity: parseFloat(e.target.value) })}
            className="w-40 accent-white"
          />
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Map &amp; Canvas Accent</p>
            <p className="text-xs text-[var(--text-3)]">Adjusts canvas reticles, router waves, and particle tint.</p>
          </div>
          <div className="flex items-center gap-2">
            {(Object.entries(ACCENT_PRESETS) as [AccentPreset, (typeof ACCENT_PRESETS)[AccentPreset]][]).map(([key, item]) => {
              const active = settings.accentPreset === key
              return (
                <button
                  key={key}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    sound.click()
                    updateSettings({ accentPreset: key })
                  }}
                  style={{ backgroundColor: item.hex }}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${active ? 'border-white scale-110' : 'border-white/25 hover:scale-105'
                    }`}
                />
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Procedural Micro-Audio (ASMR)</p>
            <p className="text-xs text-[var(--text-3)]">Synthesized Web Audio detents, switches &amp; scan sonar tones.</p>
          </div>
          <Switch
            checked={settings.audioEnabled}
            label="Enable micro-audio"
            onChange={v => updateSettings({ audioEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Sound Profile &amp; Hover Ticks</p>
            <p className="text-xs text-[var(--text-3)]">Adjust click profile and optional pointer hover detents.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={settings.audioPreset}
              onChange={e => updateSettings({ audioPreset: e.target.value as AudioPreset })}
              className="select"
              style={{ width: 165 }}
            >
              {AUDIO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Switch
              checked={settings.audioHoverTicks}
              label="Hover ticks"
              onChange={v => updateSettings({ audioHoverTicks: v })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-2 border-t border-[var(--edge)]">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Master Gain ({Math.round(settings.audioVolume * 100)}%)</p>
            <p className="text-xs text-[var(--text-3)]">Loudness level across tactile chimes.</p>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.audioVolume}
            onChange={e => updateSettings({ audioVolume: parseFloat(e.target.value) })}
            className="w-40 accent-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--edge)]">
          <Button size="sm" onClick={() => sound.click()} silent>
            <Volume2 size={14} /> Preview Click
          </Button>
          <Button size="sm" onClick={() => sound.scan()} silent>
            <Radar size={14} /> Preview Scan Sonar
          </Button>
          <Button size="sm" onClick={() => sound.success()} silent>
            <Check size={14} /> Preview Success
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => sound.open()} silent>
            <Play size={14} /> Modal Chime
          </Button>
        </div>
      </div>
    </Modal>
  )
}
