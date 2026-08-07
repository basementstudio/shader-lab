
type TwiddleTable = {
  cos: Float64Array
  sin: Float64Array
}

const bitReversalCache = new Map<number, Uint32Array>()
const hannWindowCache = new Map<number, Float64Array>()
const twiddleCache = new Map<number, TwiddleTable>()

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

function assertFftSize(size: number): void {
  if (!isPowerOfTwo(size) || size < 2) {
    throw new Error(
      `fft size must be a power of two and at least 2, received ${size}`
    )
  }
}

export function getHannWindow(size: number): Float64Array {
  assertFftSize(size)

  const cached = hannWindowCache.get(size)
  if (cached) {
    return cached
  }

  const window = new Float64Array(size)
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / size))
  }

  hannWindowCache.set(size, window)

  return window
}

export function getWindowSum(window: Float64Array): number {
  let sum = 0
  for (const coefficient of window) {
    sum += coefficient
  }

  return sum
}

function getBitReversalTable(size: number): Uint32Array {
  const cached = bitReversalCache.get(size)
  if (cached) {
    return cached
  }

  const bitCount = Math.log2(size)
  const table = new Uint32Array(size)

  for (let index = 0; index < size; index += 1) {
    let reversed = 0
    for (let bit = 0; bit < bitCount; bit += 1) {
      if ((index & (1 << bit)) !== 0) {
        reversed |= 1 << (bitCount - 1 - bit)
      }
    }
    table[index] = reversed
  }

  bitReversalCache.set(size, table)

  return table
}

function getTwiddleTable(size: number): TwiddleTable {
  const cached = twiddleCache.get(size)
  if (cached) {
    return cached
  }

  const half = size / 2
  const cos = new Float64Array(half)
  const sin = new Float64Array(half)

  for (let index = 0; index < half; index += 1) {
    const angle = (-2 * Math.PI * index) / size
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }

  const table: TwiddleTable = { cos, sin }
  twiddleCache.set(size, table)

  return table
}

export function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const size = real.length
  assertFftSize(size)

  if (imag.length !== size) {
    throw new Error(
      `fft real and imag buffers must match in length, received ${size} and ${imag.length}`
    )
  }

  const reversal = getBitReversalTable(size)
  for (let index = 0; index < size; index += 1) {
    const target = reversal[index] ?? 0
    if (target > index) {
      const realTemp = real[index] ?? 0
      const imagTemp = imag[index] ?? 0
      real[index] = real[target] ?? 0
      imag[index] = imag[target] ?? 0
      real[target] = realTemp
      imag[target] = imagTemp
    }
  }

  const twiddle = getTwiddleTable(size)

  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2
    const stride = size / length

    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < half; offset += 1) {
        const twiddleIndex = offset * stride
        const cos = twiddle.cos[twiddleIndex] ?? 0
        const sin = twiddle.sin[twiddleIndex] ?? 0

        const lowIndex = start + offset
        const highIndex = lowIndex + half

        const highReal = real[highIndex] ?? 0
        const highImag = imag[highIndex] ?? 0
        const rotatedReal = highReal * cos - highImag * sin
        const rotatedImag = highReal * sin + highImag * cos

        const lowReal = real[lowIndex] ?? 0
        const lowImag = imag[lowIndex] ?? 0

        real[highIndex] = lowReal - rotatedReal
        imag[highIndex] = lowImag - rotatedImag
        real[lowIndex] = lowReal + rotatedReal
        imag[lowIndex] = lowImag + rotatedImag
      }
    }
  }
}

export type FftWorkspace = {
  imag: Float64Array
  magnitudes: Float32Array
  real: Float64Array
  size: number
  window: Float64Array
  windowScale: number
}

export function createFftWorkspace(size: number): FftWorkspace {
  assertFftSize(size)

  const window = getHannWindow(size)

  return {
    imag: new Float64Array(size),
    magnitudes: new Float32Array(size / 2 + 1),
    real: new Float64Array(size),
    size,
    window,
    windowScale: 2 / getWindowSum(window),
  }
}

export function computeFrameMagnitudes(
  workspace: FftWorkspace,
  samples: Float32Array,
  offset: number
): Float32Array {
  const { imag, magnitudes, real, size, window, windowScale } = workspace

  for (let index = 0; index < size; index += 1) {
    const sampleIndex = offset + index
    const sample =
      sampleIndex >= 0 && sampleIndex < samples.length
        ? (samples[sampleIndex] ?? 0)
        : 0
    real[index] = sample * (window[index] ?? 0)
    imag[index] = 0
  }

  fftInPlace(real, imag)

  const binCount = size / 2 + 1
  for (let bin = 0; bin < binCount; bin += 1) {
    const binReal = real[bin] ?? 0
    const binImag = imag[bin] ?? 0
    magnitudes[bin] = Math.hypot(binReal, binImag) * windowScale
  }

  return magnitudes
}

export function binToFrequency(
  bin: number,
  size: number,
  sampleRate: number
): number {
  return (bin * sampleRate) / size
}

export function frequencyToBin(
  frequencyHz: number,
  size: number,
  sampleRate: number
): number {
  if (!Number.isFinite(frequencyHz) || sampleRate <= 0) {
    return 0
  }

  const bin = Math.round((frequencyHz * size) / sampleRate)

  return Math.min(Math.max(bin, 0), size / 2)
}
