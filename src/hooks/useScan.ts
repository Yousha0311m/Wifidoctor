// useScan.ts | SignalFLoor | Synchronized Wi-Fi scan points hook without render-time dispatches

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScanPoint } from '@/types'
import { POINTS_EVENT, POINTS_KEY, writePoints } from '@/lib/workspace'

function load(): ScanPoint[] {
  try {
    const raw = localStorage.getItem(POINTS_KEY)
    return raw ? (JSON.parse(raw) as ScanPoint[]) : []
  } catch {
    return []
  }
}

export function useScan() {
  const [points, setPointsState] = useState<ScanPoint[]>(load)
  const ref = useRef<ScanPoint[]>(points)

  useEffect(() => {
    ref.current = points
  }, [points])

  useEffect(() => {
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<ScanPoint[]>).detail
      if (next && next !== ref.current) {
        ref.current = next
        setPointsState(next)
      }
    }
    window.addEventListener(POINTS_EVENT, onSync)
    return () => window.removeEventListener(POINTS_EVENT, onSync)
  }, [])

  const setPoints = useCallback((updater: ScanPoint[] | ((prev: ScanPoint[]) => ScanPoint[])) => {
    const next = typeof updater === 'function' ? updater(ref.current) : updater
    ref.current = next
    setPointsState(next)
    queueMicrotask(() => writePoints(next))
  }, [])

  const addPoint = useCallback((p: ScanPoint) => {
    setPoints(ps => [...ps, p])
  }, [setPoints])

  const removePoint = useCallback((id: number) => {
    setPoints(ps => ps.filter(p => p.id !== id))
  }, [setPoints])

  const clear = useCallback(() => {
    setPoints([])
  }, [setPoints])

  return { points, setPoints, addPoint, removePoint, clear }
}
