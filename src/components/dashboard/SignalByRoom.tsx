// SignalByRoom.tsx | SignalFLoor | Room-level signal bars inside liquid-glass panel

import { Signal } from 'lucide-react'
import { GlassCard } from '@/components/ui/Kit'
import { levelBg, levelText, rssiToPercent, signalLevel } from '@/lib/signal'
import type { Room } from '@/types'

interface Props {
  data: { room: Room; avg: number; count: number }[]
}

export default function SignalByRoom({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.avg - b.avg)

  return (
    <GlassCard eyebrow="Zones" title="Signal by Room" icon={<Signal size={16} />}>
      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--text-3)]">No room-tagged scans yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map(({ room, avg, count }) => {
            const lvl = signalLevel(avg)
            return (
              <div key={room.id}>
                <div className="flex justify-between items-baseline text-xs mb-1">
                  <span className="text-[var(--text)] font-medium truncate">
                    {room.name}{' '}
                    <span className="text-[var(--text-3)] font-mono text-[11px]">({count})</span>
                  </span>
                  <span className={`font-mono ${levelText[lvl]}`}>{avg} dBm</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${levelBg[lvl]}`}
                    style={{ width: `${rssiToPercent(avg)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
