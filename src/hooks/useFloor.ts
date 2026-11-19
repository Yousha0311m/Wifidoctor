// useFloor.ts | SignalFLoor | Synchronized floorplan room state hook without render-time dispatches

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Room } from '@/types'
import { ROOMS_EVENT, ROOMS_KEY, writeRooms } from '@/lib/workspace'

function load(): Room[] {
  try {
    const raw = localStorage.getItem(ROOMS_KEY)
    return raw ? (JSON.parse(raw) as Room[]) : []
  } catch {
    return []
  }
}

export function useFloor() {
  const [rooms, setRoomsState] = useState<Room[]>(load)
  const ref = useRef<Room[]>(rooms)

  useEffect(() => {
    ref.current = rooms
  }, [rooms])

  useEffect(() => {
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<Room[]>).detail
      if (next && next !== ref.current) {
        ref.current = next
        setRoomsState(next)
      }
    }
    window.addEventListener(ROOMS_EVENT, onSync)
    return () => window.removeEventListener(ROOMS_EVENT, onSync)
  }, [])

  const setRooms = useCallback((updater: Room[] | ((prev: Room[]) => Room[])) => {
    const next = typeof updater === 'function' ? updater(ref.current) : updater
    ref.current = next
    setRoomsState(next)
    queueMicrotask(() => writeRooms(next))
  }, [])

  const addRoom = useCallback((rect: Omit<Room, 'id' | 'name'> & { name?: string }) => {
    const id = crypto.randomUUID()
    setRooms(rs => [...rs, { id, name: rect.name?.trim() || `Room ${rs.length + 1}`, x: rect.x, y: rect.y, w: rect.w, h: rect.h }])
    return id
  }, [setRooms])

  const updateRoom = useCallback((id: string, patch: Partial<Room>) => {
    setRooms(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }, [setRooms])

  const removeRoom = useCallback((id: string) => {
    setRooms(rs => rs.filter(r => r.id !== id))
  }, [setRooms])

  const clearRooms = useCallback(() => {
    setRooms([])
  }, [setRooms])

  return { rooms, setRooms, addRoom, updateRoom, removeRoom, clearRooms }
}
