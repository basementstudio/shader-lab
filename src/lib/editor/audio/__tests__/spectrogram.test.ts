import { describe, expect, test } from "bun:test"
import {
  clampBandConfig,
  createDefaultAudioBands,
  createSpectroBandLayout,
  DEFAULT_FFT_SIZE,
  ENVELOPE_RATE,
  frequencyToBinRange,
  MIN_RELEASE_MS,
  resolveSpectroBandRange,
  SPECTRO_BAND_COUNT,
} from "@/lib/editor/audio/bands"
import {
  analyzeSpectrogram,
  analyzeSpectrogramStepwise,
  downmixToMono,
} from "@/lib/editor/audio/spectrogram"

const SAMPLE_RATE = 48000
const HOP = SAMPLE_RATE / ENVELOPE_RATE

describe("frequencyToBinRange", () => {
  test("maps the default bass range and always excludes DC", () => {
    // 20Hz -> bin 0.85 (floored to 0, raised to 1); 140Hz -> bin 5.97 (ceil 6).
    expect(frequencyToBinRange(20, 140, DEFAULT_FFT_SIZE, SAMPLE_RATE)).toEqual({
      endBin: 6,
      startBin: 1,
    })
  })

  test("clamps above nyquist", () => {
    const range = frequencyToBinRange(
      1000,
      999_999,
      DEFAULT_FFT_SIZE,
      SAMPLE_RATE
    )

    expect(range.endBin).toBe(DEFAULT_FFT_SIZE / 2)
  })

  test("normalizes an inverted range instead of throwing", () => {
    expect(frequencyToBinRange(140, 20, DEFAULT_FFT_SIZE, SAMPLE_RATE)).toEqual(
      frequencyToBinRange(20, 140, DEFAULT_FFT_SIZE, SAMPLE_RATE)
    )
  })

  test("degrades to a single bin for a sub-bin-width range", () => {
    const range = frequencyToBinRange(
      1000,
      1000.1,
      DEFAULT_FFT_SIZE,
      SAMPLE_RATE
    )

    expect(range.startBin).toBeLessThanOrEqual(range.endBin)
  })

  test("returns a safe range for non-finite input", () => {
    expect(
      frequencyToBinRange(
        Number.NaN,
        Number.NaN,
        DEFAULT_FFT_SIZE,
        SAMPLE_RATE
      )
    ).toEqual({ endBin: 1, startBin: 1 })
  })
})

describe("createSpectroBandLayout", () => {
  test("produces ascending edges and centres between them", () => {
    const layout = createSpectroBandLayout(SAMPLE_RATE)

    expect(layout.edgeHz).toHaveLength(SPECTRO_BAND_COUNT + 1)
    expect(layout.centerHz).toHaveLength(SPECTRO_BAND_COUNT)

    for (let index = 0; index < SPECTRO_BAND_COUNT; index += 1) {
      const lower = layout.edgeHz[index] ?? 0
      const upper = layout.edgeHz[index + 1] ?? 0
      const center = layout.centerHz[index] ?? 0

      expect(upper).toBeGreaterThan(lower)
      expect(center).toBeGreaterThan(lower)
      expect(center).toBeLessThan(upper)
    }
  })

  test("never exceeds nyquist for a low sample rate", () => {
    const layout = createSpectroBandLayout(8000)
    const top = layout.edgeHz[SPECTRO_BAND_COUNT] ?? 0

    expect(top).toBeLessThanOrEqual(4000 + 1e-3)
  })
})

describe("resolveSpectroBandRange", () => {
  const centerHz = createSpectroBandLayout(SAMPLE_RATE).centerHz

  test("selects the bands whose centres fall inside the range", () => {
    const range = resolveSpectroBandRange(centerHz, 20, 140)

    expect(range.startIndex).toBe(0)
    expect(centerHz[range.endIndex] ?? 0).toBeLessThan(140)
    expect(centerHz[range.endIndex + 1] ?? 0).toBeGreaterThanOrEqual(140)
  })

  test("falls back to the nearest single band for a very narrow range", () => {
    const range = resolveSpectroBandRange(centerHz, 1000, 1000.5)

    expect(range.startIndex).toBe(range.endIndex)
    expect(centerHz[range.startIndex] ?? 0).toBeGreaterThan(800)
    expect(centerHz[range.startIndex] ?? 0).toBeLessThan(1250)
  })

  test("handles an empty layout", () => {
    expect(resolveSpectroBandRange(new Float32Array(0), 20, 140)).toEqual({
      endIndex: 0,
      startIndex: 0,
    })
  })
})

describe("clampBandConfig", () => {
  test("floors release at one envelope step to avoid aliasing on export", () => {
    const clamped = clampBandConfig({
      attackMs: -5,
      gainDb: 0,
      highHz: 2000,
      lowHz: 140,
      releaseMs: 0,
    })

    expect(clamped.releaseMs).toBeCloseTo(MIN_RELEASE_MS, 6)
    expect(clamped.attackMs).toBe(0)
  })

  test("keeps highHz above lowHz", () => {
    const clamped = clampBandConfig({
      attackMs: 10,
      gainDb: 0,
      highHz: 50,
      lowHz: 500,
      releaseMs: 100,
    })

    expect(clamped.highHz).toBeGreaterThan(clamped.lowHz)
  })

  test("clamps frequencies to nyquist", () => {
    const clamped = clampBandConfig(
      { attackMs: 10, gainDb: 0, highHz: 99_999, lowHz: 20, releaseMs: 100 },
      48000
    )

    expect(clamped.highHz).toBeLessThanOrEqual(24000)
  })
})

describe("createDefaultAudioBands", () => {
  test("returns independent copies so edits cannot leak between projects", () => {
    const first = createDefaultAudioBands()
    const second = createDefaultAudioBands()

    first.bass.lowHz = 999

    expect(second.bass.lowHz).toBe(20)
  })

  test("bands tile the spectrum without gaps", () => {
    const bands = createDefaultAudioBands()

    expect(bands.bass.highHz).toBe(bands.mid.lowHz)
    expect(bands.mid.highHz).toBe(bands.high.lowHz)
  })
})

describe("analyzeSpectrogram", () => {
  test("derives frame count from the hop size", () => {
    const samples = new Float32Array(SAMPLE_RATE)
    const spectrogram = analyzeSpectrogram(samples, SAMPLE_RATE)

    expect(spectrogram.frameCount).toBe(Math.ceil(SAMPLE_RATE / HOP))
    expect(spectrogram.envelopeRate).toBe(ENVELOPE_RATE)
    expect(spectrogram.durationSeconds).toBeCloseTo(1, 6)
  })

  test("centres each frame on its timestamp", () => {
    // An impulse at t=0.5s must peak at frame 30 (0.5 * 60), not ~half a window
    // later. Left-aligned framing would report a kick ~21ms late.
    const samples = new Float32Array(SAMPLE_RATE)
    samples[Math.round(0.5 * SAMPLE_RATE)] = 1

    const spectrogram = analyzeSpectrogram(samples, SAMPLE_RATE)

    let peakFrame = 0
    for (let frame = 0; frame < spectrogram.frameCount; frame += 1) {
      if (
        (spectrogram.rms[frame] ?? 0) > (spectrogram.rms[peakFrame] ?? 0)
      ) {
        peakFrame = frame
      }
    }

    expect(peakFrame).toBe(Math.round(0.5 * ENVELOPE_RATE))
  })

  test("the generator yields ascending progress ending at 1", () => {
    const iterator = analyzeSpectrogramStepwise(
      new Float32Array(SAMPLE_RATE),
      SAMPLE_RATE
    )

    const progress: number[] = []
    let step = iterator.next()
    while (!step.done) {
      progress.push(step.value)
      step = iterator.next()
    }

    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(1)
    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index] ?? 0).toBeGreaterThanOrEqual(
        progress[index - 1] ?? 0
      )
    }
  })

  test("the sync path matches a drained generator exactly", () => {
    const samples = new Float32Array(SAMPLE_RATE / 2)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE)
    }

    const direct = analyzeSpectrogram(samples, SAMPLE_RATE)

    const iterator = analyzeSpectrogramStepwise(samples, SAMPLE_RATE)
    let step = iterator.next()
    while (!step.done) {
      step = iterator.next()
    }

    expect(Array.from(step.value.bands)).toEqual(Array.from(direct.bands))
    expect(Array.from(step.value.rms)).toEqual(Array.from(direct.rms))
  })

  test("throws on a non-positive sample rate", () => {
    expect(() => {
      analyzeSpectrogram(new Float32Array(128), 0)
    }).toThrow(/sampleRate/)
  })

  test("handles a shorter-than-one-window buffer", () => {
    const spectrogram = analyzeSpectrogram(new Float32Array(16), SAMPLE_RATE)

    expect(spectrogram.frameCount).toBeGreaterThanOrEqual(1)
    expect(spectrogram.bands).toHaveLength(
      spectrogram.frameCount * SPECTRO_BAND_COUNT
    )
  })
})

describe("downmixToMono", () => {
  test("averages channels rather than summing", () => {
    const left = new Float32Array([1, 0, -1])
    const right = new Float32Array([1, 1, -1])

    expect(Array.from(downmixToMono([left, right]))).toEqual([1, 0.5, -1])
  })

  test("returns the single channel unchanged", () => {
    const mono = new Float32Array([0.5])

    expect(downmixToMono([mono])).toBe(mono)
  })

  test("returns an empty buffer for no channels", () => {
    expect(downmixToMono([])).toHaveLength(0)
  })
})
