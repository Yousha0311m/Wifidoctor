// qr.ts | SignalFLoor | Standards-compliant ISO 18004 QR Code matrix & SVG path generator (Byte mode, ECC-L)

interface VersionSpec {
  version: number
  size: number
  dataPerBlock: number
  eccPerBlock: number
  blocks: number
  align: number[]
}

const SPECS: VersionSpec[] = [
  { version: 1, size: 21, dataPerBlock: 19, eccPerBlock: 7, blocks: 1, align: [] },
  { version: 2, size: 25, dataPerBlock: 34, eccPerBlock: 10, blocks: 1, align: [6, 18] },
  { version: 3, size: 29, dataPerBlock: 55, eccPerBlock: 15, blocks: 1, align: [6, 22] },
  { version: 4, size: 33, dataPerBlock: 80, eccPerBlock: 20, blocks: 1, align: [6, 26] },
  { version: 5, size: 37, dataPerBlock: 108, eccPerBlock: 26, blocks: 1, align: [6, 30] },
  { version: 6, size: 41, dataPerBlock: 68, eccPerBlock: 18, blocks: 2, align: [6, 34] },
]

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_EXP[i + 255] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0)
    const root = GF_EXP[i]
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], root)
    }
    poly = next
  }
  return poly
}

function rsRemainder(data: number[], eccCount: number): number[] {
  const gen = rsGenerator(eccCount)
  const buf = new Array<number>(data.length + eccCount).fill(0)
  for (let i = 0; i < data.length; i++) buf[i] = data[i]
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i]
    if (factor === 0) continue
    for (let j = 0; j < gen.length; j++) {
      buf[i + j] ^= gfMul(gen[j], factor)
    }
  }
  return buf.slice(data.length)
}

function maskTest(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0
    case 1: return r % 2 === 0
    case 2: return c % 3 === 0
    case 3: return (r + c) % 3 === 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function penaltyScore(grid: boolean[][]): number {
  const n = grid.length
  let score = 0

  for (let r = 0; r < n; r++) {
    let run = 1
    for (let c = 1; c < n; c++) {
      if (grid[r][c] === grid[r][c - 1]) {
        run += 1
        if (run === 5) score += 3
        else if (run > 5) score += 1
      } else {
        run = 1
      }
    }
  }

  for (let c = 0; c < n; c++) {
    let run = 1
    for (let r = 1; r < n; r++) {
      if (grid[r][c] === grid[r - 1][c]) {
        run += 1
        if (run === 5) score += 3
        else if (run > 5) score += 1
      } else {
        run = 1
      }
    }
  }

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = grid[r][c]
      if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) {
        score += 3
      }
    }
  }

  return score
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  const totalCapBytes = (spec: VersionSpec) => spec.dataPerBlock * spec.blocks
  const spec = SPECS.find(s => totalCapBytes(s) >= bytes.length + 2) ?? SPECS[SPECS.length - 1]
  const maxPayload = Math.min(bytes.length, totalCapBytes(spec) - 2)
  const payload = bytes.slice(0, maxPayload)

  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }

  pushBits(0b0100, 4) // Byte mode
  pushBits(payload.length, 8)
  for (const b of payload) pushBits(b, 8)

  const totalDataBytes = totalCapBytes(spec)
  const capBits = totalDataBytes * 8
  pushBits(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const dataBytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    dataBytes.push(byte)
  }
  const padBytes = [0xec, 0x11]
  let padIdx = 0
  while (dataBytes.length < totalDataBytes) {
    dataBytes.push(padBytes[padIdx % 2])
    padIdx += 1
  }

  const dataBlocks: number[][] = []
  const eccBlocks: number[][] = []
  for (let b = 0; b < spec.blocks; b++) {
    const chunk = dataBytes.slice(b * spec.dataPerBlock, (b + 1) * spec.dataPerBlock)
    dataBlocks.push(chunk)
    eccBlocks.push(rsRemainder(chunk, spec.eccPerBlock))
  }

  const codewords: number[] = []
  for (let i = 0; i < spec.dataPerBlock; i++) {
    for (const blk of dataBlocks) codewords.push(blk[i])
  }
  for (let i = 0; i < spec.eccPerBlock; i++) {
    for (const blk of eccBlocks) codewords.push(blk[i])
  }

  const size = spec.size
  const isFunc = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const base = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))

  const placeFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr
        const c = left + dc
        if (r < 0 || r >= size || c < 0 || c >= size) continue
        isFunc[r][c] = true
        const border = dr === 0 || dr === 6 || dc === 0 || dc === 6
        const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        base[r][c] = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (border || inner)
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  for (let i = 8; i < size - 8; i++) {
    isFunc[6][i] = true
    base[6][i] = i % 2 === 0
    isFunc[i][6] = true
    base[i][6] = i % 2 === 0
  }

  for (const cr of spec.align) {
    for (const cc of spec.align) {
      if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= size - 8) || (cr >= size - 8 && cc <= 8)) {
        continue
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = cr + dr
          const c = cc + dc
          isFunc[r][c] = true
          base[r][c] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)
        }
      }
    }
  }

  // Reserve format info cells & fixed dark module
  isFunc[size - 8][8] = true
  base[size - 8][8] = true
  for (let i = 0; i <= 8; i++) {
    isFunc[8][i] = true
    isFunc[i][8] = true
  }
  for (let i = size - 8; i < size; i++) {
    isFunc[8][i] = true
  }
  for (let i = size - 7; i < size; i++) {
    isFunc[i][8] = true
  }

  // Place data + ECC bits in zigzag scan
  const streamBits: number[] = []
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) streamBits.push((cw >> b) & 1)
  }

  let bitPtr = 0
  let dir = -1
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1
    for (let step = 0; step < size; step++) {
      const r = dir === -1 ? size - 1 - step : step
      for (const c of [col, col - 1]) {
        if (isFunc[r][c]) continue
        base[r][c] = bitPtr < streamBits.length ? streamBits[bitPtr] === 1 : false
        bitPtr += 1
      }
    }
    dir = -dir
  }

  const writeFormat = (grid: boolean[][], mask: number) => {
    const info = (0b01 << 3) | mask // ECC Level L = 01
    let rem = info << 10
    for (let i = 14; i >= 10; i--) {
      if ((rem >> i) & 1) rem ^= 0x537 << (i - 10)
    }
    const fmt = ((info << 10) | rem) ^ 0x5412
    const bitAt = (k: number) => ((fmt >> k) & 1) === 1

    const topLeftH = [0, 1, 2, 3, 4, 5, 7, 8]
    for (let i = 0; i < 8; i++) grid[8][topLeftH[i]] = bitAt(14 - i)
    const topLeftV = [7, 5, 4, 3, 2, 1, 0]
    for (let i = 0; i < 7; i++) grid[topLeftV[i]][8] = bitAt(6 - i)

    for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = bitAt(14 - i)
    for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = bitAt(7 - i)
    grid[size - 8][8] = true
  }

  let bestGrid = base
  let bestScore = Infinity

  for (let m = 0; m < 8; m++) {
    const candidate = base.map((row, r) =>
      row.map((val, c) => (isFunc[r][c] ? val : maskTest(m, r, c) ? !val : val)),
    )
    writeFormat(candidate, m)
    const s = penaltyScore(candidate)
    if (s < bestScore) {
      bestScore = s
      bestGrid = candidate
    }
  }

  return bestGrid
}

export function qrMatrixToSvgPath(matrix: boolean[][], margin = 2): { path: string; viewSize: number } {
  const n = matrix.length
  const parts: string[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        parts.push(`M${c + margin},${r + margin}h1v1h-1z`)
      }
    }
  }
  return { path: parts.join(''), viewSize: n + margin * 2 }
}
