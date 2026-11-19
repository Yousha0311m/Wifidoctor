// toast.ts | SignalFLoor | Lightweight pub-sub toast notifications

import { sound } from './sounds'

export type ToastLevel = 'info' | 'success' | 'warn' | 'error'

export interface ToastItem {
  id: number
  message: string
  level: ToastLevel
}

type Listener = (item: ToastItem) => void

const listeners = new Set<Listener>()
let nextId = 1

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function toast(message: string, level: ToastLevel = 'info'): void {
  if (!message) return
  if (level === 'success') sound.success()
  else if (level === 'error') sound.error()
  const item: ToastItem = { id: nextId++, message, level }
  for (const fn of listeners) fn(item)
}
