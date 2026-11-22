// useMonitor.ts | Wi-Ma | Monitor-mode data: polls the backend, or serves demo data held in memory

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { clearMonitor, getMonitor, setMonitorMode } from '@/lib/api'
import { makeDemoMonitor } from '@/lib/monitor'
import type { MonitorEvent, MonitorSample, MonitorState } from '@/types'

// ---- demo store (in memory only, never saved, never sent to the backend) ----
interface Demo {
  samples: MonitorSample[]
  events: MonitorEvent[]
}
let demo: Demo | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export const loadMonitorDemo = () => {
  demo = makeDemoMonitor(Date.now())
  emit()
}
export const clearMonitorDemo = () => {
  demo = null
  emit()
}

const POLL_MS = 10_000

// Current time, refreshed on a timer so "x minutes ago" and the chart window stay fresh
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}
const EMPTY_STATE: MonitorState = { enabled: false, interval: 60, last_seen: null }

export interface MonitorData {
  samples: MonitorSample[]
  events: MonitorEvent[]
  state: MonitorState
  source: 'device' | 'demo'
  reachable: boolean // can the dashboard talk to the backend at all
  setMonitoring: (enabled: boolean, interval: number) => Promise<void>
  clearHistory: () => Promise<void>
}

export function useMonitor(): MonitorData {
  const demoSnap = useSyncExternalStore(subscribe, () => demo)
  const [samples, setSamples] = useState<MonitorSample[]>([])
  const [events, setEvents] = useState<MonitorEvent[]>([])
  const [state, setState] = useState<MonitorState>(EMPTY_STATE)
  const [reachable, setReachable] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getMonitor(24 * 7)
      setSamples(data.samples)
      setEvents(data.events)
      setState(data.state)
      setReachable(true)
    } catch {
      setReachable(false)
    }
  }, [])

  useEffect(() => {
    if (demoSnap) return
    const first = window.setTimeout(load, 0)
    const id = window.setInterval(load, POLL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [demoSnap, load])

  const setMonitoring = useCallback(
    async (enabled: boolean, interval: number) => {
      await setMonitorMode(enabled, interval)
      // The board confirms by sending its new state; show the change right away meanwhile
      setState(s => ({ ...s, enabled, interval }))
      window.setTimeout(load, 1500)
    },
    [load],
  )

  const clearHistory = useCallback(async () => {
    await clearMonitor()
    setSamples([])
    setEvents([])
  }, [])

  if (demoSnap) {
    return {
      samples: demoSnap.samples,
      events: demoSnap.events,
      state: { enabled: true, interval: 300, last_seen: demoSnap.samples[demoSnap.samples.length - 1]?.t ?? null },
      source: 'demo',
      reachable: true,
      setMonitoring: async () => {},
      clearHistory: async () => {},
    }
  }
  return { samples, events, state, source: 'device', reachable, setMonitoring, clearHistory }
}
