import { describe, expect, test } from "bun:test"
import { createSpectroBandLayout } from "@/lib/editor/audio/bands"
import { analyzeSpectrogram } from "@/lib/editor/audio/spectrogram"
import {
  buildSpectrumPath,
  createSpectrumPathScratch,
  DEFAULT_SPECTRUM_DISPLAY,
  smoothSpectrumInto,
  spectrogramFrameAt,
  SPECTRUM_FALL_COEFFICIENT,
  SPECTRUM_RISE_COEFFICIENT,
  type SpectrumDisplayOptions,
  spectrumHeights,
} from "@/lib/editor/audio/spectrum-path"

const SAMPLE_RATE = 48000
const options: SpectrumDisplayOptions = {
  ...DEFAULT_SPECTRUM_DISPLAY,
  height: 100,
  width: 300,
}

describe("smoothSpectrumInto", () => {
  test("rises faster than it falls", () => {
    const rising = new Float32Array([0])
    smoothSpectrumInto(rising, new Float32Array([1]))

    const falling = new Float32Array([1])
    smoothSpectrumInto(falling, new Float32Array([0]))

    expect(rising[0]).toBeCloseTo(SPECTRUM_RISE_COEFFICIENT, 6)
    expect(1 - (falling[0] ?? 0)).toBeCloseTo(SPECTRUM_FALL_COEFFICIENT, 6)
    expect(rising[0] ?? 0).toBeGreaterThan(1 - (falling[0] ?? 0))
  })

  test("converges towards a held target", () => {
    const smoothed = new Float32Array([0])
    for (let step = 0; step < 40; step += 1) {
      smoothSpectrumInto(smoothed, new Float32Array([1]))
    }

    expect(smoothed[0]).toBeGreaterThan(0.99)
  })

  test("tolerates a shorter frame than buffer", () => {
    const smoothed = new Float32Array([0, 0, 0])

    expect(() => {
      smoothSpectrumInto(smoothed, new Float32Array([1]))
    }).not.toThrow()
    expect(smoothed[2]).toBe(0)
  })
})

describe("smoothSpectrumInto frame-rate independence", () => {
  test("the default delta reproduces the legacy per-frame coefficients", () => {
    const rising = new Float32Array([0])
    smoothSpectrumInto(rising, new Float32Array([1]))
    expect(rising[0]).toBeCloseTo(SPECTRUM_RISE_COEFFICIENT, 6)

    const falling = new Float32Array([1])
    smoothSpectrumInto(falling, new Float32Array([0]))
    expect(falling[0]).toBeCloseTo(1 - SPECTRUM_FALL_COEFFICIENT, 6)
  })

  test("two 60Hz steps land where one 30Hz step lands", () => {
    const target = new Float32Array([0])

    const at60 = new Float32Array([1])
    smoothSpectrumInto(at60, target, 1 / 60)
    smoothSpectrumInto(at60, target, 1 / 60)

    const at30 = new Float32Array([1])
    smoothSpectrumInto(at30, target, 2 / 60)

    expect(at30[0]).toBeCloseTo(at60[0] ?? 0, 6)
  })

  test("a 120Hz step decays half as far as a 60Hz step", () => {
    const fast = new Float32Array([1])
    smoothSpectrumInto(fast, new Float32Array([0]), 1 / 120)

    const slow = new Float32Array([1])
    smoothSpectrumInto(slow, new Float32Array([0]), 1 / 60)

    expect(fast[0]).toBeGreaterThan(slow[0] ?? 0)
    expect((fast[0] ?? 0) ** 2).toBeCloseTo(slow[0] ?? 0, 6)
  })

  test("a non-finite or huge delta falls back to something sane", () => {
    const nan = new Float32Array([1])
    smoothSpectrumInto(nan, new Float32Array([0]), Number.NaN)
    expect(nan[0]).toBeCloseTo(1 - SPECTRUM_FALL_COEFFICIENT, 6)

    const stalled = new Float32Array([1])
    smoothSpectrumInto(stalled, new Float32Array([0]), 30)
    expect(stalled[0]).toBeGreaterThanOrEqual(0)
    expect(stalled[0]).toBeLessThanOrEqual(1)
  })
})

describe("spectrumHeights", () => {
  const centerHz = createSpectroBandLayout(SAMPLE_RATE).centerHz

  test("stays within [0,1]", () => {
    const magnitudes = new Float32Array(centerHz.length)
    for (let index = 0; index < magnitudes.length; index += 1) {
      magnitudes[index] = index % 2 === 0 ? 40 : 1e-12
    }

    const heights = spectrumHeights(
      magnitudes,
      centerHz,
      options,
      new Float32Array(centerHz.length)
    )

    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(0)
      expect(height).toBeLessThanOrEqual(1)
    }
  })

  test("silence sits on the floor", () => {
    const heights = spectrumHeights(
      new Float32Array(centerHz.length),
      centerHz,
      options,
      new Float32Array(centerHz.length)
    )

    for (const height of heights) {
      expect(height).toBe(0)
    }
  })

  test("louder magnitudes read higher", () => {
    const quiet = spectrumHeights(
      new Float32Array(centerHz.length).fill(0.002),
      centerHz,
      options,
      new Float32Array(centerHz.length)
    )
    const loud = spectrumHeights(
      new Float32Array(centerHz.length).fill(0.02),
      centerHz,
      options,
      new Float32Array(centerHz.length)
    )

    expect(loud[10] ?? 0).toBeGreaterThan(quiet[10] ?? 0)
  })

  test("tilt lifts the high end relative to the low end", () => {
    const flat = new Float32Array(centerHz.length).fill(0.01)
    const heights = spectrumHeights(
      flat,
      centerHz,
      options,
      new Float32Array(centerHz.length)
    )

    expect(heights.at(-1) ?? 0).toBeGreaterThan(heights[0] ?? 0)
  })

  test("no tilt leaves an equal-magnitude spectrum flat", () => {
    const flat = new Float32Array(centerHz.length).fill(0.01)
    const heights = spectrumHeights(
      flat,
      centerHz,
      { ...options, tiltDbPerDecade: 0 },
      new Float32Array(centerHz.length)
    )

    expect(heights.at(-1) ?? 0).toBeCloseTo(heights[0] ?? 0, 5)
  })
})

describe("buildSpectrumPath", () => {
  const centerHz = createSpectroBandLayout(SAMPLE_RATE).centerHz

  test("returns a closed filled path spanning the box", () => {
    const heights = new Float32Array(centerHz.length).fill(0.5)
    const path = buildSpectrumPath(heights, centerHz, options)

    expect(path.startsWith("M0 100")).toBe(true)
    expect(path.endsWith("Z")).toBe(true)
    expect(path).toContain("C")
  })

  test("silence hugs the bottom edge", () => {
    const path = buildSpectrumPath(
      new Float32Array(centerHz.length),
      centerHz,
      options
    )

    const ys = [...path.matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((match) =>
      Number(match[1])
    )

    expect(ys.length).toBeGreaterThan(0)
    for (const y of ys) {
      expect(y).toBeCloseTo(options.height, 5)
    }
  })

  test("full scale reaches the top edge", () => {
    const path = buildSpectrumPath(
      new Float32Array(centerHz.length).fill(1),
      centerHz,
      options
    )

    expect(path).toContain("L0 0")
  })

  test("returns empty for degenerate input", () => {
    expect(buildSpectrumPath(new Float32Array(0), centerHz, options)).toBe("")
    expect(
      buildSpectrumPath(
        new Float32Array([1]),
        new Float32Array([100]),
        options
      )
    ).toBe("")
  })

  test("is deterministic", () => {
    const heights = new Float32Array(centerHz.length).fill(0.42)

    expect(buildSpectrumPath(heights, centerHz, options)).toBe(
      buildSpectrumPath(heights, centerHz, options)
    )
  })

  test("a reused scratch buffer matches the unbuffered path", () => {
    const scratch = createSpectrumPathScratch()
    const first = new Float32Array(centerHz.length).fill(0.3)
    const second = new Float32Array(centerHz.length).fill(0.8)

    expect(buildSpectrumPath(first, centerHz, options, scratch)).toBe(
      buildSpectrumPath(first, centerHz, options)
    )
    expect(buildSpectrumPath(second, centerHz, options, scratch)).toBe(
      buildSpectrumPath(second, centerHz, options)
    )
    expect(buildSpectrumPath(first, centerHz, options, scratch)).toBe(
      buildSpectrumPath(first, centerHz, options)
    )
  })

  test("a scratch buffer recomputes x positions when width or bands change", () => {
    const scratch = createSpectrumPathScratch()
    const heights = new Float32Array(centerHz.length).fill(0.5)
    const wider: SpectrumDisplayOptions = { ...options, width: 600 }
    const otherBands = createSpectroBandLayout(SAMPLE_RATE, 32).centerHz
    const otherHeights = new Float32Array(otherBands.length).fill(0.5)

    buildSpectrumPath(heights, centerHz, options, scratch)

    expect(buildSpectrumPath(heights, centerHz, wider, scratch)).toBe(
      buildSpectrumPath(heights, centerHz, wider)
    )
    expect(buildSpectrumPath(otherHeights, otherBands, options, scratch)).toBe(
      buildSpectrumPath(otherHeights, otherBands, options)
    )
    expect(buildSpectrumPath(heights, centerHz, options, scratch)).toBe(
      buildSpectrumPath(heights, centerHz, options)
    )
  })
})

describe("spectrogramFrameAt", () => {
  const spectrogram = analyzeSpectrogram(
    new Float32Array(SAMPLE_RATE).fill(0.1),
    SAMPLE_RATE
  )

  test("returns one row of bands", () => {
    const frame = spectrogramFrameAt(spectrogram, 0.5)

    expect(frame).not.toBeNull()
    expect(frame).toHaveLength(spectrogram.bandCount)
  })

  test("clamps before the start and past the end", () => {
    const first = spectrogramFrameAt(spectrogram, -5)
    const last = spectrogramFrameAt(spectrogram, 9999)

    expect(Array.from(first ?? [])).toEqual(
      Array.from(spectrogram.bands.subarray(0, spectrogram.bandCount))
    )
    expect(last).toHaveLength(spectrogram.bandCount)
  })

  test("returns null for non-finite time", () => {
    expect(spectrogramFrameAt(spectrogram, Number.NaN)).toBeNull()
  })
})
