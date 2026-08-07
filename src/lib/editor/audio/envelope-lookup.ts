import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"

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

export function sampleAllBandsInto(
  envelopes: AudioEnvelopeSet,
  offsetSeconds: number,
  time: number,
  out: Record<AudioBandId, number>
): Record<AudioBandId, number> {
  for (const bandId of AUDIO_BAND_IDS) {
    out[bandId] = sampleBand(envelopes, bandId, offsetSeconds, time)
  }

  return out
}

export function sampleAllBands(
  envelopes: AudioEnvelopeSet,
  offsetSeconds: number,
  time: number
): Record<AudioBandId, number> {
  return sampleAllBandsInto(
    envelopes,
    offsetSeconds,
    time,
    {} as Record<AudioBandId, number>
  )
}

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

  if (!(Number.isFinite(offsetSeconds) && Number.isFinite(durationSeconds))) {
    return new Float32Array(0)
  }

  const lastIndex = envelope.length - 1
  const clampIndex = (value: number) =>
    Math.min(Math.max(value, 0), lastIndex)

  const peaks = new Float32Array(targetCount)
  const bucketSeconds = durationSeconds / targetCount

  for (let index = 0; index < targetCount; index += 1) {
    const start = clampIndex(
      Math.floor((offsetSeconds + index * bucketSeconds) * envelopes.envelopeRate)
    )
    const end = clampIndex(
      Math.ceil(
        (offsetSeconds + (index + 1) * bucketSeconds) * envelopes.envelopeRate
      ) - 1
    )

    const lastCursor = Math.max(end, start)

    let peak = 0
    for (let cursor = start; cursor <= lastCursor; cursor += 1) {
      const value = envelope[cursor] ?? 0
      if (value > peak) {
        peak = value
      }
    }

    peaks[index] = peak
  }

  return peaks
}

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
