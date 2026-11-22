// Legend.tsx | SignalFLoor | Semantic pill key for RSSI strength buckets, with pulsing glow dots

const ITEMS = [
  { label: 'Strong', range: '> -50', cls: 'ok', level: 'strong' },
  { label: 'Fair', range: '-67..-50', cls: 'warn', level: 'fair' },
  { label: 'Weak', range: '< -67', cls: 'err', level: 'weak' },
]

export default function Legend() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {ITEMS.map(i => (
        <span key={i.label} className={`chip ${i.cls}`}>
          <span className={`signal-dot ${i.level}`} />
          <span>{i.label}</span>
          <span className="font-mono text-[10px] opacity-80 hidden sm:inline">{i.range}</span>
        </span>
      ))}
    </div>
  )
}
