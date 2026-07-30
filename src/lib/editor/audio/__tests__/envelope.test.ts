import { describe, expect, test } from "bun:test"
import { createDefaultAudioBands, ENVELOPE_RATE } from "@/lib/editor/audio/bands"
import {
  computeBandNormalization,
  computeEnvelopeSet,
  computeReferenceLevel,
  extractBandSeries,
  smoothEnvelopeInPlace,
} from "@/lib/editor/audio/envelope"
import { sampleBand } from "@/lib/editor/audio/envelope-lookup"
import { analyzeSpectrogram } from "@/lib/editor/audio/spectrogram"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"

const SAMPLE_RATE = 48000

function makeSine(
  frequencyHz: number,
  amplitude: number,
  seconds: number
): Float32Array {
  const sampleCount = Math.round(SAMPLE_RATE * seconds)
  const samples = new Float32Array(sampleCount)

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE)
  }

  return samples
}

function analyzeSine(frequencyHz: number, amplitude: number, seconds = 2) {
  const samples = makeSine(frequencyHz, amplitude, seconds)
  const spectrogram = analyzeSpectrogram(samples, SAMPLE_RATE)

  return computeEnvelopeSet(spectrogram, createDefaultAudioBands())
}

/** Value once the attack has settled, away from the start and end ramps. */
function steadyState(
  envelopes: ReturnType<typeof computeEnvelopeSet>,
  bandId: AudioBandId
): number {
  return sampleBand(envelopes, bandId, 0, 1.5)
}

describe("computeReferenceLevel", () => {
  test("returns 0 for an empty series", () => {
    expect(computeReferenceLevel(new Float32Array(0))).toBe(0)
  })

  test("approximates the 99th percentile, not the peak", () => {
    // 99 samples at 0.1 and one at 100. A peak-based reference would return
    // ~100 and crush everything else; the percentile must stay near 0.1.
    const series = new Float32Array(100).fill(0.1)
    series[99] = 100

    const reference = computeReferenceLevel(series)

    expect(reference).toBeGreaterThan(0.05)
    expect(reference).toBeLessThan(0.5)
  })
})

describe("raw band bucketing", () => {
  // Isolation is asserted on the *raw* magnitudes, before normalization.
  // Normalized envelopes cannot express it: normalization is per-band and
  // relative, so a constant tone drives every band that receives any energy to
  // full scale (its p99 equals its own steady value). That is correct for real,
  // dynamic music and is why the user-facing guarantee is temporal
  // discrimination, tested below.
  function rawSteady(frequencyHz: number, bandId: AudioBandId): number {
    const spectrogram = analyzeSpectrogram(
      makeSine(frequencyHz, 0.8, 1),
      SAMPLE_RATE
    )
    const series = extractBandSeries(
      spectrogram,
      bandId,
      createDefaultAudioBands()[bandId]
    )

    return series[Math.round(series.length / 2)] ?? 0
  }

  test("a 60Hz sine deposits far more energy in bass than in mid or high", () => {
    const bass = rawSteady(60, "bass")

    expect(bass).toBeGreaterThan(rawSteady(60, "mid") * 20)
    expect(bass).toBeGreaterThan(rawSteady(60, "high") * 1000)
  })

  test("an 800Hz sine deposits far more energy in mid than in bass or high", () => {
    const mid = rawSteady(800, "mid")

    expect(mid).toBeGreaterThan(rawSteady(800, "bass") * 20)
    expect(mid).toBeGreaterThan(rawSteady(800, "high") * 20)
  })

  test("an 8kHz sine deposits far more energy in high than in bass or mid", () => {
    const high = rawSteady(8000, "high")

    expect(high).toBeGreaterThan(rawSteady(8000, "bass") * 100)
    expect(high).toBeGreaterThan(rawSteady(8000, "mid") * 100)
  })

  test("a band with genuinely no content is gated to silence", () => {
    const envelopes = analyzeSine(60, 0.8)

    expect(envelopes.silentBands).toContain("high")
    expect(steadyState(envelopes, "high")).toBe(0)
  })
})

describe("temporal band discrimination", () => {
  // The user-facing guarantee: when the music moves between bands, the
  // envelopes follow.
  function analyzeTwoTone(): ReturnType<typeof computeEnvelopeSet> {
    const seconds = 2
    const sampleCount = SAMPLE_RATE * seconds
    const samples = new Float32Array(sampleCount)
    const half = sampleCount / 2

    for (let index = 0; index < sampleCount; index += 1) {
      const frequencyHz = index < half ? 60 : 800
      samples[index] =
        0.8 * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE)
    }

    return computeEnvelopeSet(
      analyzeSpectrogram(samples, SAMPLE_RATE),
      createDefaultAudioBands()
    )
  }

  test("bass leads while the low tone plays and falls back when it stops", () => {
    const envelopes = analyzeTwoTone()

    const bassDuringLow = sampleBand(envelopes, "bass", 0, 0.8)
    const bassDuringHigh = sampleBand(envelopes, "bass", 0, 1.8)

    expect(bassDuringLow).toBeGreaterThan(0.9)
    expect(bassDuringHigh).toBeLessThan(bassDuringLow * 0.6)
  })

  test("mid rises only once the higher tone starts", () => {
    const envelopes = analyzeTwoTone()

    const midDuringLow = sampleBand(envelopes, "mid", 0, 0.8)
    const midDuringHigh = sampleBand(envelopes, "mid", 0, 1.8)

    expect(midDuringHigh).toBeGreaterThan(0.9)
    expect(midDuringLow).toBeLessThan(midDuringHigh * 0.6)
  })

  test("the level band responds to any content", () => {
    expect(steadyState(analyzeSine(60, 0.8), "level")).toBeGreaterThan(0.9)
    expect(steadyState(analyzeSine(8000, 0.8), "level")).toBeGreaterThan(0.9)
  })
})

describe("quiet tracks", () => {
  test("a very quiet 60Hz sine still drives bass to full scale", () => {
    // The whole point of per-band percentile normalization: a track mastered
    // 40dB down must still be usable without the user touching a gain control.
    const envelopes = analyzeSine(60, 0.008)

    expect(steadyState(envelopes, "bass")).toBeGreaterThan(0.9)
  })

  test("loud and quiet versions of the same signal agree closely", () => {
    const loud = steadyState(analyzeSine(60, 0.9), "bass")
    const quiet = steadyState(analyzeSine(60, 0.004), "bass")

    expect(Math.abs(loud - quiet)).toBeLessThan(0.05)
  })
})

describe("self-calibrating normalization", () => {
  test("derives a window from the series' own distribution", () => {
    // Two levels 20dB apart: 1.0 and 0.1.
    const series = new Float32Array(200)
    for (let index = 0; index < series.length; index += 1) {
      series[index] = index % 2 === 0 ? 1 : 0.1
    }

    const { lowDb, spanDb } = computeBandNormalization(series)

    expect(spanDb).toBeGreaterThan(15)
    expect(spanDb).toBeLessThanOrEqual(48)
    expect(lowDb).toBeLessThan(0)
  })

  test("floors the span so a near-constant band is not stretched to full swing", () => {
    const series = new Float32Array(200).fill(0.5)

    expect(computeBandNormalization(series).spanDb).toBeCloseTo(9, 6)
  })

  test("returns a usable window for an empty series", () => {
    expect(computeBandNormalization(new Float32Array(0)).spanDb).toBeGreaterThan(
      0
    )
  })

  test("a loudness-compressed source still uses most of the [0,1] range", () => {
    // Regression guard for the real-music failure this replaced: a fixed 48dB
    // window left a mastered track's bands clustered between 0.7 and 0.95,
    // which reads as visually static. Here bass energy varies only ~12dB, as on
    // a compressed master.
    const seconds = 4
    const sampleCount = SAMPLE_RATE * seconds
    const samples = new Float32Array(sampleCount)

    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / SAMPLE_RATE
      const amplitude = Math.floor(t * 2) % 2 === 0 ? 0.9 : 0.225
      samples[index] = amplitude * Math.sin(2 * Math.PI * 60 * t)
    }

    const envelopes = computeEnvelopeSet(
      analyzeSpectrogram(samples, SAMPLE_RATE),
      createDefaultAudioBands()
    )

    const values = Array.from(envelopes.bands.bass).sort((a, b) => a - b)
    const low = values[Math.floor(values.length * 0.05)] ?? 0
    const high = values[Math.floor(values.length * 0.95)] ?? 0

    expect(high - low).toBeGreaterThan(0.5)
  })
})

describe("silence", () => {
  test("a silent track yields all-zero envelopes and reports every band silent", () => {
    const spectrogram = analyzeSpectrogram(
      new Float32Array(SAMPLE_RATE),
      SAMPLE_RATE
    )
    const envelopes = computeEnvelopeSet(spectrogram, createDefaultAudioBands())

    expect(envelopes.silentBands).toHaveLength(AUDIO_BAND_IDS.length)

    for (const bandId of AUDIO_BAND_IDS) {
      for (const value of envelopes.bands[bandId]) {
        expect(value).toBe(0)
      }
    }
  })
})

describe("attack and release", () => {
  test("rises during attack and decays after the signal stops", () => {
    // 0.5s of 60Hz then 0.5s of silence.
    const samples = new Float32Array(SAMPLE_RATE)
    for (let index = 0; index < SAMPLE_RATE / 2; index += 1) {
      samples[index] = 0.8 * Math.sin((2 * Math.PI * 60 * index) / SAMPLE_RATE)
    }

    const spectrogram = analyzeSpectrogram(samples, SAMPLE_RATE)
    const envelopes = computeEnvelopeSet(spectrogram, createDefaultAudioBands())

    const atOnset = sampleBand(envelopes, "bass", 0, 0.002)
    const settled = sampleBand(envelopes, "bass", 0, 0.4)
    const released = sampleBand(envelopes, "bass", 0, 0.75)

    expect(atOnset).toBeLessThan(settled)
    expect(settled).toBeGreaterThan(0.9)
    expect(released).toBeLessThan(0.2)
  })

  test("zero attack reaches the target within a single step", () => {
    const envelope = new Float32Array(8).fill(1)
    smoothEnvelopeInPlace(envelope, 0, 100, ENVELOPE_RATE)

    expect(envelope[0]).toBeCloseTo(1, 6)
  })

  test("release follows a one-pole decay", () => {
    const envelope = new Float32Array(ENVELOPE_RATE)
    envelope[0] = 1

    const releaseMs = 100
    smoothEnvelopeInPlace(envelope, 0, releaseMs, ENVELOPE_RATE)

    // After `releaseMs`, a one-pole decay from 1 sits at exp(-1) ~= 0.368.
    const afterOneTimeConstant = envelope[Math.round(ENVELOPE_RATE / 10)] ?? 0

    expect(afterOneTimeConstant).toBeGreaterThan(Math.exp(-1) * 0.85)
    expect(afterOneTimeConstant).toBeLessThan(Math.exp(-1) * 1.15)
  })

  test("smoothing never leaves the [0,1] range of its input", () => {
    const envelope = new Float32Array([0, 1, 0, 1, 1, 0, 0.5, 1])
    smoothEnvelopeInPlace(envelope, 1, 1, ENVELOPE_RATE)

    for (const value of envelope) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe("the [0,1] invariant", () => {
  const fixtures: [string, Float32Array][] = [
    ["60Hz loud", makeSine(60, 0.95, 1)],
    ["60Hz very quiet", makeSine(60, 0.002, 1)],
    ["800Hz", makeSine(800, 0.5, 1)],
    ["8kHz", makeSine(8000, 0.5, 1)],
    ["silence", new Float32Array(SAMPLE_RATE)],
    ["clipped square-ish", Float32Array.from(makeSine(120, 4, 1), Math.sign)],
  ]

  for (const [label, samples] of fixtures) {
    test(`holds for ${label}`, () => {
      const spectrogram = analyzeSpectrogram(samples, SAMPLE_RATE)
      const envelopes = computeEnvelopeSet(
        spectrogram,
        createDefaultAudioBands()
      )

      for (const bandId of AUDIO_BAND_IDS) {
        for (const value of envelopes.bands[bandId]) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1)
        }
      }
    })
  }
})

describe("stage B determinism and locality", () => {
  test("is idempotent for the same spectrogram and bands", () => {
    const spectrogram = analyzeSpectrogram(makeSine(220, 0.6, 1), SAMPLE_RATE)

    const first = computeEnvelopeSet(spectrogram, createDefaultAudioBands())
    const second = computeEnvelopeSet(spectrogram, createDefaultAudioBands())

    for (const bandId of AUDIO_BAND_IDS) {
      expect(Array.from(first.bands[bandId])).toEqual(
        Array.from(second.bands[bandId])
      )
    }
  })

  test("editing the high band leaves bass byte-identical", () => {
    // This is the property the instant band editor depends on.
    const spectrogram = analyzeSpectrogram(
      makeSine(60, 0.6, 1),
      SAMPLE_RATE
    )

    const before = computeEnvelopeSet(spectrogram, createDefaultAudioBands())

    const edited = createDefaultAudioBands()
    edited.high = { ...edited.high, lowHz: 4000 }
    const after = computeEnvelopeSet(spectrogram, edited)

    expect(Array.from(after.bands.bass)).toEqual(Array.from(before.bands.bass))
  })

  test("raising a band's gain raises its envelope", () => {
    const spectrogram = analyzeSpectrogram(makeSine(60, 0.02, 2), SAMPLE_RATE)

    const quietBands = createDefaultAudioBands()
    quietBands.bass = { ...quietBands.bass, gainDb: -30 }

    const attenuated = computeEnvelopeSet(spectrogram, quietBands)
    const neutral = computeEnvelopeSet(spectrogram, createDefaultAudioBands())

    expect(steadyState(attenuated, "bass")).toBeLessThan(
      steadyState(neutral, "bass")
    )
  })
})
