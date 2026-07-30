import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"

/**
 * Band value at `time`, linearly interpolated between envelope samples.
 *
 * This is the single seam through which every consumer — the live render loop,
 * the offline exporter, agent screenshots, the sidebar readout — reads audio.
 * Keeping it a pure function of `time` is what makes exported video match the
 * preview frame for frame.
 *
 * Clamps rather than wraps at both ends: a 6 second timeline over a 4 minute
 * track should hold the last value, not loop the intro. `offsetSeconds` is how
 * the user chooses which part of a long track a short timeline sees.
 */
export function sampleBand(
  envelopes: AudioEnvelopeSet,
  bandId: AudioBandId,
  offsetSeconds: number,
  time: number
): number {
  const envelope = envelopes.bands[bandId]

  if (!envelope || envelope.length === 0) {
    return 0
  }

  const shifted = time + offsetSeconds

  if (!Number.isFinite(shifted)) {
    return 0
  }

  const position = shifted * envelopes.envelopeRate

  if (position <= 0) {
    return envelope[0] ?? 0
  }

  const lastIndex = envelope.length - 1

  if (position >= lastIndex) {
    return envelope[lastIndex] ?? 0
  }

  const lowerIndex = Math.floor(position)
  const lower = envelope[lowerIndex] ?? 0
  const upper = envelope[lowerIndex + 1] ?? lower

  return lower + (upper - lower) * (position - lowerIndex)
}

/** Every band at one instant. Four array lookups — safe to call per frame. */
export function sampleAllBands(
  envelopes: AudioEnvelopeSet,
  offsetSeconds: number,
  time: number
): Record<AudioBandId, number> {
  const values = {} as Record<AudioBandId, number>

  for (const bandId of AUDIO_BAND_IDS) {
    values[bandId] = sampleBand(envelopes, bandId, offsetSeconds, time)
  }

  return values
}

/**
 * Peaks for just the slice of a band the timeline actually shows.
 *
 * The timeline covers `[offsetSeconds, offsetSeconds + durationSeconds]` of the
 * track, which for a long song is a small window — drawing the whole envelope
 * would compress it into an unreadable smear.
 */
export function sampleEnvelopeWindow(
  envelopes: AudioEnvelopeSet,
  bandId: AudioBandId,
  offsetSeconds: number,
  durationSeconds: number,
  targetCount: number
): Float32Array {
  const envelope = envelopes.bands[bandId]

  if (!envelope || envelope.length === 0) {
    return new Float32Array(0)
  }

  if (targetCount <= 0 || durationSeconds <= 0) {
    return new Float32Array(0)
  }

  const start = Math.min(
    Math.max(Math.floor(offsetSeconds * envelopes.envelopeRate), 0),
    envelope.length
  )
  const end = Math.min(
    Math.ceil((offsetSeconds + durationSeconds) * envelopes.envelopeRate),
    envelope.length
  )

  if (end <= start) {
    return new Float32Array(0)
  }

  return sampleEnvelopeToPeaks(envelope.subarray(start, end), targetCount)
}

/**
 * Downsample an envelope to `targetCount` peaks for drawing. Takes the maximum
 * of each bucket rather than the mean so transients stay visible at any zoom
 * level — a mean-reduced waveform looks limp.
 */
export function sampleEnvelopeToPeaks(
  envelope: Float32Array,
  targetCount: number
): Float32Array {
  if (targetCount <= 0 || envelope.length === 0) {
    return new Float32Array(0)
  }

  if (envelope.length <= targetCount) {
    return Float32Array.from(envelope)
  }

  const peaks = new Float32Array(targetCount)
  const bucketSize = envelope.length / targetCount

  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor(index * bucketSize)
    const end = Math.min(
      Math.max(Math.floor((index + 1) * bucketSize), start + 1),
      envelope.length
    )

    let peak = 0
    for (let cursor = start; cursor < end; cursor += 1) {
      const value = envelope[cursor] ?? 0
      if (value > peak) {
        peak = value
      }
    }

    peaks[index] = peak
  }

  return peaks
}
