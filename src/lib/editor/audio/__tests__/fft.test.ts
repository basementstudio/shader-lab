import { describe, expect, test } from "bun:test"
import {
  binToFrequency,
  computeFrameMagnitudes,
  createFftWorkspace,
  fftInPlace,
  frequencyToBin,
  getHannWindow,
  getWindowSum,
  isPowerOfTwo,
} from "@/lib/editor/audio/fft"

const SAMPLE_RATE = 48000
const FFT_SIZE = 2048

function makeSine(
  frequencyHz: number,
  amplitude: number,
  sampleCount: number
): Float32Array {
  const samples = new Float32Array(sampleCount)
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE)
  }

  return samples
}

function peakBin(magnitudes: Float32Array): number {
  let best = 0
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    if ((magnitudes[bin] ?? 0) > (magnitudes[best] ?? 0)) {
      best = bin
    }
  }

  return best
}

describe("isPowerOfTwo", () => {
  test("accepts powers of two", () => {
    expect(isPowerOfTwo(2)).toBe(true)
    expect(isPowerOfTwo(1024)).toBe(true)
    expect(isPowerOfTwo(2048)).toBe(true)
  })

  test("rejects non-powers of two, zero, negatives and fractions", () => {
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(3)).toBe(false)
    expect(isPowerOfTwo(1000)).toBe(false)
    expect(isPowerOfTwo(-1024)).toBe(false)
    expect(isPowerOfTwo(2.5)).toBe(false)
  })
})

describe("getHannWindow", () => {
  test("is periodic: starts at zero and peaks at the centre", () => {
    const window = getHannWindow(FFT_SIZE)

    expect(window[0]).toBeCloseTo(0, 10)
    expect(window[FFT_SIZE / 2]).toBeCloseTo(1, 10)
  })

  test("sums to half the window size", () => {
    // The periodic Hann window has mean 0.5 exactly.
    expect(getWindowSum(getHannWindow(FFT_SIZE))).toBeCloseTo(FFT_SIZE / 2, 6)
  })

  test("returns a cached instance for repeated sizes", () => {
    expect(getHannWindow(512)).toBe(getHannWindow(512))
  })
})

describe("fftInPlace", () => {
  test("throws on a non-power-of-two length", () => {
    expect(() => {
      fftInPlace(new Float64Array(3), new Float64Array(3))
    }).toThrow(/power of two/)
  })

  test("throws when real and imag lengths disagree", () => {
    expect(() => {
      fftInPlace(new Float64Array(8), new Float64Array(4))
    }).toThrow(/match in length/)
  })

  test("puts a constant signal entirely in bin 0", () => {
    const size = 16
    const real = new Float64Array(size).fill(1)
    const imag = new Float64Array(size)

    fftInPlace(real, imag)

    expect(real[0]).toBeCloseTo(size, 10)
    for (let bin = 1; bin < size; bin += 1) {
      expect(Math.hypot(real[bin] ?? 0, imag[bin] ?? 0)).toBeCloseTo(0, 10)
    }
  })
})

describe("computeFrameMagnitudes", () => {
  test("locates a 1kHz sine at the expected bin and rejects distant bins", () => {
    // 1000 Hz / (48000 / 2048) = 42.67 -> nearest bin is 43.
    const workspace = createFftWorkspace(FFT_SIZE)
    const samples = makeSine(1000, 1, FFT_SIZE * 2)

    const magnitudes = computeFrameMagnitudes(workspace, samples, 0)

    expect(peakBin(magnitudes)).toBe(43)
    expect(magnitudes[43] ?? 0).toBeGreaterThan((magnitudes[60] ?? 0) * 20)
  })

  test("a bin-centred full-scale sine reads a magnitude near 1.0", () => {
    // Bin 43 centre is exactly 43 * 48000 / 2048 Hz, so there is no scalloping
    // loss and the windowScale normalization is directly observable.
    const workspace = createFftWorkspace(FFT_SIZE)
    const centreHz = binToFrequency(43, FFT_SIZE, SAMPLE_RATE)
    const samples = makeSine(centreHz, 1, FFT_SIZE * 2)

    const magnitudes = computeFrameMagnitudes(workspace, samples, 0)

    expect(magnitudes[43] ?? 0).toBeCloseTo(1, 2)
  })

  test("amplitude scales the peak magnitude linearly", () => {
    const workspace = createFftWorkspace(FFT_SIZE)
    const centreHz = binToFrequency(43, FFT_SIZE, SAMPLE_RATE)

    const loud = computeFrameMagnitudes(
      workspace,
      makeSine(centreHz, 1, FFT_SIZE * 2),
      0
    )
    const loudPeak = loud[43] ?? 0

    const quiet = computeFrameMagnitudes(
      workspace,
      makeSine(centreHz, 0.01, FFT_SIZE * 2),
      0
    )
    const quietPeak = quiet[43] ?? 0

    expect(quietPeak).toBeCloseTo(loudPeak * 0.01, 4)
  })

  test("a unit impulse produces a flat magnitude spectrum", () => {
    const workspace = createFftWorkspace(FFT_SIZE)
    const samples = new Float32Array(FFT_SIZE)
    // Window peak is exactly 1.0 at size/2, so every bin should read windowScale.
    samples[FFT_SIZE / 2] = 1

    const magnitudes = computeFrameMagnitudes(workspace, samples, 0)
    const expected = workspace.windowScale

    for (const magnitude of magnitudes) {
      expect(magnitude).toBeCloseTo(expected, 8)
    }
  })

  test("zero-pads out-of-bounds offsets instead of wrapping", () => {
    const workspace = createFftWorkspace(64)
    const samples = new Float32Array(8).fill(1)

    // Entirely before the buffer: nothing to window, so every bin is silent.
    const magnitudes = computeFrameMagnitudes(workspace, samples, -1000)

    for (const magnitude of magnitudes) {
      expect(magnitude).toBe(0)
    }
  })

  test("is deterministic across repeated runs", () => {
    const samples = makeSine(440, 0.7, FFT_SIZE * 2)

    const first = Float32Array.from(
      computeFrameMagnitudes(createFftWorkspace(FFT_SIZE), samples, 128)
    )
    const second = Float32Array.from(
      computeFrameMagnitudes(createFftWorkspace(FFT_SIZE), samples, 128)
    )

    expect(Array.from(first)).toEqual(Array.from(second))
  })
})

describe("frequencyToBin / binToFrequency", () => {
  test("round-trips a bin centre", () => {
    const hz = binToFrequency(43, FFT_SIZE, SAMPLE_RATE)

    expect(frequencyToBin(hz, FFT_SIZE, SAMPLE_RATE)).toBe(43)
  })

  test("clamps above nyquist and below zero", () => {
    expect(frequencyToBin(999_999, FFT_SIZE, SAMPLE_RATE)).toBe(FFT_SIZE / 2)
    expect(frequencyToBin(-500, FFT_SIZE, SAMPLE_RATE)).toBe(0)
  })

  test("returns 0 for non-finite input", () => {
    expect(frequencyToBin(Number.NaN, FFT_SIZE, SAMPLE_RATE)).toBe(0)
    expect(frequencyToBin(Number.POSITIVE_INFINITY, FFT_SIZE, 0)).toBe(0)
  })
})
