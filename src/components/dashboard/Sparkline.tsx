// Sparkline.tsx | SignalFLoor | Liquid-glass RSSI timeline sparkline with min/max bounds

import { Activity } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { GlassCard } from '@/components/ui/Kit'
import type { ScanPoint } from '@/types'

export default function Sparkline({ points }: { points: ScanPoint[] }) {
  const vals = points.map(p => p.rssi)
  const best = vals.length ? Math.max(...vals) : 0
  const worst = vals.length ? Math.min(...vals) : 0

  return (
    <GlassCard
      eyebrow="Telemetry"
      title="RSSI Trend"
      icon={<Activity size={16} />}
      action={
        vals.length > 0 && (
          <span className="chip font-mono">
            {worst}..{best} dBm
          </span>
        )
      }
    >
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
            <Tooltip
              contentStyle={{
                background: 'var(--glass-solid)',
                border: '1px solid var(--edge-strong)',
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={() => 'Signal'}
              formatter={v => [`${v} dBm`, 'RSSI']}
            />
            <Line
              type="monotone"
              dataKey="rssi"
              stroke="var(--text)"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
