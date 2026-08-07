import { describe, expect, test } from "bun:test"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import {
  sampleAllBands,
  sampleBand,
  sampleEnvelopeToPeaks,
  sampleEnvelopeWindow,
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

describe("sampleEnvelopeWindow", () => {
  const envelopes = makeEnvelopes(
    Array.from({ length: 240 }, (_, index) => (Math.floor(index / 60) + 1) / 4)
  )

  test("reads only the requested window of a longer track", () => {
    const peaks = sampleEnvelopeWindow(envelopes, "bass", 2, 1, 4)

    expect(peaks).toHaveLength(4)
    for (const peak of peaks) {
      expect(peak).toBeCloseTo(0.75, 5)
    }
  })

  test("the offset shifts which slice is read", () => {
    const first = sampleEnvelopeWindow(envelopes, "bass", 0, 1, 2)
    const last = sampleEnvelopeWindow(envelopes, "bass", 3, 1, 2)

    expect(first[0]).toBeCloseTo(0.25, 5)
    expect(last[0]).toBeCloseTo(1, 5)
  })

  test("clamps a window that runs past the end", () => {
    const peaks = sampleEnvelopeWindow(envelopes, "bass", 3.5, 100, 4)

    expect(peaks.length).toBeGreaterThan(0)
    for (const peak of peaks) {
      expect(peak).toBeCloseTo(1, 5)
    }
  })

  test("holds the last value past the end, matching sampleBand", () => {
    const peaks = sampleEnvelopeWindow(envelopes, "bass", 999, 1, 4)

    expect(peaks).toHaveLength(4)
    for (const peak of peaks) {
      expect(peak).toBeCloseTo(sampleBand(envelopes, "bass", 999, 0), 5)
    }
  })

  test("returns empty for a non-positive duration or count", () => {
    expect(sampleEnvelopeWindow(envelopes, "bass", 0, 0, 4)).toHaveLength(0)
    expect(sampleEnvelopeWindow(envelopes, "bass", 0, 1, 0)).toHaveLength(0)
  })

  test("bucket index maps to the same timeline time the driver reads", () => {
    const durationSeconds = 8
    const count = 16
    const peaks = sampleEnvelopeWindow(
      envelopes,
      "bass",
      0,
      durationSeconds,
      count
    )

    expect(peaks).toHaveLength(count)

    for (let index = 0; index < count; index += 1) {
      const time = (index / count) * durationSeconds
      expect(peaks[index]).toBeCloseTo(sampleBand(envelopes, "bass", 0, time), 5)
    }
  })

  test("a track shorter than the window is not stretched across it", () => {
    const spiked = makeEnvelopes(
      Array.from({ length: 120 }, (_, index) => (index === 30 ? 1 : 0))
    )

    const peaks = sampleEnvelopeWindow(spiked, "bass", 0, 10, 20)

    expect(peaks).toHaveLength(20)
    expect(peaks[1]).toBeCloseTo(1, 5)

    for (let index = 0; index < 20; index += 1) {
      if (index !== 1) {
        expect(peaks[index]).toBeCloseTo(0, 5)
      }
    }
  })

  test("a negative offset draws the leading hold rather than squeezing it out", () => {
    const peaks = sampleEnvelopeWindow(envelopes, "bass", -2, 4, 8)

    expect(peaks).toHaveLength(8)
    expect(peaks[0]).toBeCloseTo(sampleBand(envelopes, "bass", -2, 0), 5)
    expect(peaks[0]).toBeCloseTo(peaks[3] ?? 0, 5)
    expect(peaks[7]).toBeCloseTo(sampleBand(envelopes, "bass", -2, 3.5), 5)
  })

  test("returns empty for an empty envelope", () => {
    expect(sampleEnvelopeWindow(makeEnvelopes([]), "bass", 0, 1, 4)).toHaveLength(
      0
    )
  })
})

describe("sampleEnvelopeToPeaks", () => {
  test("keeps transients by taking the bucket maximum", () => {
    const envelope = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0])
    const peaks = sampleEnvelopeToPeaks(envelope, 2)

    expect(peaks).toHaveLength(2)
    expect(peaks[0]).toBe(1)
    expect(peaks[1]).toBe(0)
  })

  test("returns a copy when the envelope is already short enough", () => {
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
