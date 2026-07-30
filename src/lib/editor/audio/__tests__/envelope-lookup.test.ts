import { describe, expect, test } from "bun:test"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import {
  sampleAllBands,
  sampleBand,
  sampleEnvelopeToPeaks,
} from "@/lib/editor/audio/envelope-lookup"
import { AUDIO_BAND_IDS } from "@/types/editor"

const ENVELOPE_RATE = 60

function makeEnvelopes(bass: number[]): AudioEnvelopeSet {
  return {
    bands: {
      bass: Float32Array.from(bass),
      high: new Float32Array(bass.length),
      level: new Float32Array(bass.length),
      mid: new Float32Array(bass.length),
    },
    durationSeconds: bass.length / ENVELOPE_RATE,
    envelopeRate: ENVELOPE_RATE,
    sampleCount: bass.length,
    silentBands: [],
  }
}

describe("sampleBand", () => {
  const envelopes = makeEnvelopes([0, 0.5, 1])

  test("returns the first sample at and before t=0", () => {
    expect(sampleBand(envelopes, "bass", 0, 0)).toBe(0)
    expect(sampleBand(envelopes, "bass", 0, -10)).toBe(0)
  })

  test("returns the last sample past the end, clamping rather than wrapping", () => {
    // A short timeline over a long track must hold, not loop the intro.
    expect(sampleBand(envelopes, "bass", 0, 999)).toBe(1)
  })

  test("hits sample boundaries exactly", () => {
    expect(sampleBand(envelopes, "bass", 0, 1 / ENVELOPE_RATE)).toBeCloseTo(
      0.5,
      6
    )
  })

  test("interpolates linearly between samples", () => {
    const midpoint = 0.5 / ENVELOPE_RATE

    expect(sampleBand(envelopes, "bass", 0, midpoint)).toBeCloseTo(0.25, 6)
  })

  test("shifts by offsetSeconds", () => {
    // Offsetting by one sample period should read the next sample.
    expect(sampleBand(envelopes, "bass", 1 / ENVELOPE_RATE, 0)).toBeCloseTo(
      0.5,
      6
    )
  })

  test("returns 0 for non-finite time", () => {
    expect(sampleBand(envelopes, "bass", 0, Number.NaN)).toBe(0)
    expect(sampleBand(envelopes, "bass", 0, Number.POSITIVE_INFINITY)).toBe(0)
  })

  test("returns 0 for an empty envelope", () => {
    expect(sampleBand(makeEnvelopes([]), "bass", 0, 0.5)).toBe(0)
  })

  test("returns the single value for a one-sample envelope", () => {
    const single = makeEnvelopes([0.42])

    expect(sampleBand(single, "bass", 0, 0)).toBeCloseTo(0.42, 6)
    expect(sampleBand(single, "bass", 0, 5)).toBeCloseTo(0.42, 6)
  })
})

describe("sampleAllBands", () => {
  test("returns a value for every band id", () => {
    const values = sampleAllBands(makeEnvelopes([0, 1]), 0, 0)

    for (const bandId of AUDIO_BAND_IDS) {
      expect(typeof values[bandId]).toBe("number")
    }
  })
})

describe("sampleEnvelopeToPeaks", () => {
  test("keeps transients by taking the bucket maximum", () => {
    // A mean-based reduction would flatten the spike to 0.25.
    const envelope = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0])
    const peaks = sampleEnvelopeToPeaks(envelope, 2)

    expect(peaks).toHaveLength(2)
    expect(peaks[0]).toBe(1)
    expect(peaks[1]).toBe(0)
  })

  test("returns a copy when the envelope is already short enough", () => {
    // Exactly representable in Float32 so the equality check is meaningful.
    const envelope = Float32Array.from([0.25, 0.5])
    const peaks = sampleEnvelopeToPeaks(envelope, 8)

    expect(Array.from(peaks)).toEqual([0.25, 0.5])
    expect(peaks).not.toBe(envelope)
  })

  test("returns empty for a non-positive target or empty input", () => {
    expect(sampleEnvelopeToPeaks(Float32Array.from([1]), 0)).toHaveLength(0)
    expect(sampleEnvelopeToPeaks(new Float32Array(0), 10)).toHaveLength(0)
  })

  test("covers the whole envelope with no dropped tail", () => {
    const envelope = new Float32Array(1000)
    envelope[999] = 1

    const peaks = sampleEnvelopeToPeaks(envelope, 10)

    expect(peaks[9]).toBe(1)
  })
})
