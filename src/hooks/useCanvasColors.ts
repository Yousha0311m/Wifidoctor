// useCanvasColors.ts | SignalFLoor | Syncs CSS theme & accent custom properties into Konva/Canvas renderers

import { useEffect, useState } from 'react'

const NAMES = [
  'bg', 'panel', 'panel-2', 'line', 'ink', 'muted',
  'accent', 'accent-2', 'grid', 'wall', 'label',
  'strong', 'fair', 'weak', 'heat-blend',
]

function read(): Record<string, string> {
  const s = getComputedStyle(document.documentElement)
  return Object.fromEntries(NAMES.map(n => [n, s.getPropertyValue(`--${n}`).trim()]))
}

export function useCanvasColors() {
  const [colors, setColors] = useState(read)

  useEffect(() => {
    const sync = () => setColors(read())
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    })
    window.addEventListener('signalfloor:settings', sync)
    return () => {
      obs.disconnect()
      window.removeEventListener('signalfloor:settings', sync)
    }
  }, [])

  return colors
}
