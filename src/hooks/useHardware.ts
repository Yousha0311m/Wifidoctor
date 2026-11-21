// useHardware.ts | SignalFLoor | React binding for the Bluetooth device link status

import { useSyncExternalStore } from 'react'
import { hardware, type HardwareStatus } from '@/lib/hardware'

export function useHardware(): HardwareStatus {
  return useSyncExternalStore(hardware.subscribe, hardware.getSnapshot)
}
