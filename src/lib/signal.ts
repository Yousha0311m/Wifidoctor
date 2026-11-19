export type Level = 'strong' | 'fair' | 'weak'

export function signalLevel(rssi: number): Level {
  if (rssi > -50) return 'strong'
  if (rssi > -67) return 'fair'
  return 'weak'
}

// full class strings so Tailwind can detect them
export const levelText: Record<Level, string> = {
  strong: 'text-strong',
  fair: 'text-fair',
  weak: 'text-weak',
}
export const levelBg: Record<Level, string> = {
  strong: 'bg-strong',
  fair: 'bg-fair',
  weak: 'bg-weak',
}

// maps -95..-30 dBm to 0..100 for bar widths
export function rssiToPercent(rssi: number) {
  return Math.max(0, Math.min(100, ((rssi + 95) / 65) * 100))
}