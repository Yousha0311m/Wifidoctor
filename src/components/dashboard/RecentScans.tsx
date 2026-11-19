// RecentScans.tsx | SignalFLoor | Latest RSSI capture feed styled in liquid glass

import { Clock } from 'lucide-react'
import { GlassCard } from '@/components/ui/Kit'
import { levelText, signalLevel } from '@/lib/signal'
import type { ScanPoint } from '@/types'

export default function RecentScans({ points }: { points: ScanPoint[] }) {
  const recent = [...points]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 6)

  return (
    <GlassCard eyebrow="Stream" title="Recent Captures" icon={<Clock size={16} />}>
      <ul className="flex flex-col gap-2">
        {recent.map(p => (
          <li
            key={p.id}
            className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-black/25 border border-[var(--edge)]"
          >
            <span className="font-mono text-[var(--text-3)]">
              {new Date(p.timestamp).toTimeString().slice(0, 8)}
            </span>
            <span className="font-mono text-[var(--text-3)]">
              ({p.x}, {p.y})
            </span>
            <span className={`font-mono font-semibold ${levelText[signalLevel(p.rssi)]}`}>
              {p.rssi} dBm
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}
