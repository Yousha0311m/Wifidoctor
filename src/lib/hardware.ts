// hardware.ts | SignalFLoor | Web Serial (USB) and Web Bluetooth (BLE) handheld bridge

export interface HardwareScanPayload {
  rssi: number
  minRssi?: number
  maxRssi?: number
  samples?: number
  freeHeap?: number
  ssid?: string
  bssid?: string
}

export type HardwareConnectionType = 'none' | 'usb' | 'ble'

export interface HardwareStatus {
  connected: boolean
  type: HardwareConnectionType
  deviceName: string | null
}

const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const BLE_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'

class HardwareManager {
  private serialPort: any = null
  private serialReader: any = null
  private bleDevice: any = null
  private onScanCallback: ((data: HardwareScanPayload) => void) | null = null
  private onStatusCallback: ((status: HardwareStatus) => void) | null = null

  public status: HardwareStatus = {
    connected: false,
    type: 'none',
    deviceName: null,
  }

  public setOnScan(cb: (data: HardwareScanPayload) => void) {
    this.onScanCallback = cb
  }

  public setOnStatus(cb: (status: HardwareStatus) => void) {
    this.onStatusCallback = cb
    cb(this.status)
  }

  private updateStatus(type: HardwareConnectionType, deviceName: string | null) {
    this.status = {
      connected: type !== 'none',
      type,
      deviceName,
    }
    this.onStatusCallback?.(this.status)
  }

  // --- Web Serial (USB Cable) ---
  public async connectUsb(): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge.')
    }
    await this.disconnect()

    try {
      const nav = navigator as any
      const port = await nav.serial.requestPort()
      await port.open({ baudRate: 115200 })
      this.serialPort = port
      this.updateStatus('usb', 'ESP32-S3 (USB Serial)')

      this.readSerialLoop(port)
      return true
    } catch (err: any) {
      this.updateStatus('none', null)
      if (err.name !== 'NotFoundError') {
        throw err
      }
      return false
    }
  }

  private async readSerialLoop(port: any) {
    const textDecoder = new TextDecoderStream()
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable)
    const reader = textDecoder.readable.getReader()
    this.serialReader = reader

    let buffer = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            this.handleIncomingRaw(line.trim())
          }
        }
      }
    } catch {
      // Stream disconnected
    } finally {
      reader.releaseLock()
      await readableStreamClosed.catch(() => {})
      this.disconnect()
    }
  }

  // --- Web Bluetooth (BLE Wireless) ---
  public async connectBle(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.')
    }
    await this.disconnect()

    try {
      const nav = navigator as any
      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: 'SignalFloor' }],
        optionalServices: [BLE_SERVICE_UUID],
      })

      device.addEventListener('gattserverdisconnected', () => {
        this.updateStatus('none', null)
      })

      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID)

      await characteristic.startNotifications()
      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value
        const text = new TextDecoder().decode(value)
        this.handleIncomingRaw(text.trim())
      })

      this.bleDevice = device
      this.updateStatus('ble', device.name || 'SignalFloor ESP32')
      return true
    } catch (err: any) {
      this.updateStatus('none', null)
      if (err.name !== 'NotFoundError') {
        throw err
      }
      return false
    }
  }

  private handleIncomingRaw(line: string) {
    if (!line.startsWith('{') || !line.endsWith('}')) return
    try {
      const parsed = JSON.parse(line)
      if (typeof parsed.rssi === 'number') {
        this.onScanCallback?.(parsed)
      }
    } catch {
      // Ignore non-JSON serial logs
    }
  }

  public async disconnect() {
    if (this.serialReader) {
      try {
        await this.serialReader.cancel()
      } catch {}
      this.serialReader = null
    }
    if (this.serialPort) {
      try {
        await this.serialPort.close()
      } catch {}
      this.serialPort = null
    }
    if (this.bleDevice && this.bleDevice.gatt.connected) {
      try {
        this.bleDevice.gatt.disconnect()
      } catch {}
      this.bleDevice = null
    }
    this.updateStatus('none', null)
  }
}

export const hardware = new HardwareManager()
