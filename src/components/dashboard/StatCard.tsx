// StatCard.tsx | SignalFLoor | Monochrome glass KPI card with framed icon badge and functional status tones

import type { ReactNode } from 'react'

type Tone = 'strong' | 'fair' | 'weak' | 'accent' | 'neutral'

const TONE_VAL: Record<Tone, string> = {
  strong: 'text-[var(--ok-text)]',
  fair: 'text-[var(--warn-text)]',
  weak: 'text-[var(--err-text)]',
  accent: 'text-[var(--text)]',
  neutral: 'text-[var(--text)]',
}

interface Props {
  label: string
  value: string | number
  unit?: string
  sub?: string
  icon?: ReactNode
  tone?: Tone
}

export default function StatCard({ label, value, unit, sub, icon, tone = 'neutral' }: Props) {
  return (
    <div className="stat-card glass rounded-[var(--r)] px-4 py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon && (
          <span className="h-7 w-7 rounded-lg bg-white/[0.05] border border-[var(--edge)] grid place-items-center text-[var(--text-2)] shrink-0">
            {icon}
          </span>
        )}
      </div>
      <p className={`text-[26px] leading-none font-bold tracking-tight font-mono ${TONE_VAL[tone]}`}>
        {value}
        {unit && <span className="text-xs text-[var(--text-3)] font-normal ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-[var(--text-3)] truncate">{sub}</p>}
    </div>
  )
}
