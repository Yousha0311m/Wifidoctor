// hardware.ts | SignalFLoor | Web Bluetooth (BLE) link to the ESP32 for Wi-Fi provisioning

// Protocol (newline-terminated JSON, both directions, over one GATT characteristic):
//   app -> device  {"cmd":"wifi","ssid":"...","pass":"...","host":"192.168.0.10","port":1883,"id":"esp32-01"}
//   device -> app  {"evt":"wifi","state":"connecting|connected|failed","ip":"...","reason":"..."}
//                  {"evt":"mqtt","state":"connected|failed"}
export const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
export const BLE_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
const NAME_PREFIX = 'SignalFloor'
const WRITE_CHUNK = 100

export interface ProvisionConfig {
  ssid: string
  pass: string
  host: string
  port: number
  deviceId: string
}

export interface DeviceEvent {
  evt: string
  state?: string
  ip?: string
  reason?: string
}

export interface HardwareStatus {
  connected: boolean
  deviceName: string | null
}

// Web Bluetooth has no bundled types in this project, so the few members used are described here
interface GattCharacteristic {
  value?: DataView
  startNotifications(): Promise<unknown>
  addEventListener(type: string, cb: (e: Event) => void): void
  writeValueWithResponse?(data: BufferSource): Promise<void>
  writeValue(data: BufferSource): Promise<void>
}
interface BleDevice {
  name?: string
  gatt?: {
    connected: boolean
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<GattCharacteristic> }> }>
    disconnect(): void
  }
  addEventListener(type: string, cb: () => void): void
}
interface BleNavigator {
  bluetooth?: { requestDevice(opts: unknown): Promise<BleDevice> }
}

const IDLE: HardwareStatus = { connected: false, deviceName: null }

class HardwareManager {
  private device: BleDevice | null = null
  private characteristic: GattCharacteristic | null = null
  private status: HardwareStatus = IDLE
  private statusListeners = new Set<() => void>()
  private eventListeners = new Set<(e: DeviceEvent) => void>()
  private rx = ''

  /** Web Bluetooth needs Chrome/Edge and a secure page (HTTPS or localhost). */
  public support(): { ok: boolean; reason: 'no-api' | 'insecure' | null } {
    if (typeof navigator === 'undefined' || !(navigator as BleNavigator).bluetooth) return { ok: false, reason: 'no-api' }
    if (!window.isSecureContext) return { ok: false, reason: 'insecure' }
    return { ok: true, reason: null }
  }

  public subscribe = (cb: () => void) => {
    this.statusListeners.add(cb)
    return () => {
      this.statusListeners.delete(cb)
    }
  }

  public getSnapshot = () => this.status

  public onEvent(cb: (e: DeviceEvent) => void) {
    this.eventListeners.add(cb)
    return () => {
      this.eventListeners.delete(cb)
    }
  }

  private setStatus(next: HardwareStatus) {
    this.status = next
    this.statusListeners.forEach(cb => cb())
  }

  public async connect(): Promise<boolean> {
    const nav = navigator as BleNavigator
    if (!this.support().ok || !nav.bluetooth) throw new Error('Bluetooth is not available on this page.')
    await this.disconnect()

    // Step 1: the picker. Closing it is not an error.
    let device: BleDevice
    try {
      device = await nav.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE_UUID] }, { namePrefix: NAME_PREFIX }],
        optionalServices: [BLE_SERVICE_UUID],
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'NotFoundError') return false
      throw err
    }

    // Step 2: everything after picking. Any failure here is a real error and must be shown.
    let step = 'opening the connection'
    try {
      device.addEventListener('gattserverdisconnected', () => {
        this.device = null
        this.characteristic = null
        this.setStatus(IDLE)
      })

      step = 'opening the connection'
      const server = await device.gatt?.connect()
      if (!server) throw new Error('Could not open the Bluetooth connection.')
      step = 'finding the SignalFloor service'
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)
      step = 'finding the SignalFloor channel'
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID)

      this.rx = ''
      characteristic.addEventListener('characteristicvaluechanged', e => {
        const view = (e.target as unknown as GattCharacteristic).value
        if (view) this.handleChunk(new TextDecoder().decode(view))
      })
      step = 'turning on notifications'
      await characteristic.startNotifications()

      this.device = device
      this.characteristic = characteristic
      this.setStatus({ connected: true, deviceName: device.name || 'SignalFloor ESP32' })
      return true
    } catch (err) {
      this.setStatus(IDLE)
      try {
        device.gatt?.disconnect()
      } catch {
        // already closed
      }
      const why = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      throw new Error(`Paired, but failed while ${step} (${why})`)
    }
  }

  private handleChunk(text: string) {
    this.rx += text
    const lines = this.rx.split('\n')
    this.rx = lines.pop() ?? ''
    for (const line of lines) this.emit(line.trim())
    // A complete object without a trailing newline still counts
    const rest = this.rx.trim()
    if (rest.startsWith('{') && rest.endsWith('}')) {
      this.rx = ''
      this.emit(rest)
    }
  }

  private emit(line: string) {
    if (!line.startsWith('{') || !line.endsWith('}')) return
    try {
      const parsed = JSON.parse(line) as DeviceEvent
      if (typeof parsed.evt === 'string') this.eventListeners.forEach(cb => cb(parsed))
    } catch {
      // ignore anything that is not valid JSON
    }
  }

  private async send(payload: object) {
    const ch = this.characteristic
    if (!ch) throw new Error('Not connected to a device.')
    const bytes = new TextEncoder().encode(JSON.stringify(payload) + '\n')
    // Small chunks keep this working with the default BLE packet size
    for (let i = 0; i < bytes.length; i += WRITE_CHUNK) {
      const part = bytes.slice(i, i + WRITE_CHUNK)
      if (ch.writeValueWithResponse) await ch.writeValueWithResponse(part)
      else await ch.writeValue(part)
    }
  }

  public provision(cfg: ProvisionConfig) {
    return this.send({ cmd: 'wifi', ssid: cfg.ssid, pass: cfg.pass, host: cfg.host, port: cfg.port, id: cfg.deviceId })
  }

  public async disconnect() {
    const d = this.device
    this.device = null
    this.characteristic = null
    if (d?.gatt?.connected) {
      try {
        d.gatt.disconnect()
      } catch {
        // already gone
      }
    }
    if (this.status.connected) this.setStatus(IDLE)
  }
}

export const hardware = new HardwareManager()