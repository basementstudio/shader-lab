import {
  DYNAMIC_RANGE_DB,
  isFullBandBand,
  resolveSpectroBandRange,
  SILENCE_REFERENCE_FLOOR,
} from "@/lib/editor/audio/bands"
import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"
import {
  AUDIO_BAND_IDS,
  type AudioBandConfig,
  type AudioBandId,
} from "@/types/editor"

export type AudioEnvelopeSet = {
  bands: Record<AudioBandId, Float32Array>
  durationSeconds: number
  envelopeRate: number
  sampleCount: number
  silentBands: AudioBandId[]
}

const HISTOGRAM_BUCKETS = 1024
const HISTOGRAM_MIN_DB = -120
const HISTOGRAM_MAX_DB = 20
const HISTOGRAM_SPAN_DB = HISTOGRAM_MAX_DB - HISTOGRAM_MIN_DB

const MAGNITUDE_EPSILON = 1e-9

const REFERENCE_PERCENTILE = 0.99

const RELATIVE_SILENCE_DB = 60

const MIN_NORMALIZATION_SPAN_DB = 9

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(value, 0), 1)
}

function toDecibels(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, MAGNITUDE_EPSILON))
}

function bucketToDecibels(bucket: number): number {
  return (
    HISTOGRAM_MIN_DB +
    ((bucket + 0.5) / HISTOGRAM_BUCKETS) * HISTOGRAM_SPAN_DB
  )
}

function computeDbHistogram(series: Float32Array): Uint32Array {
  const histogram = new Uint32Array(HISTOGRAM_BUCKETS)

  for (const value of series) {
    const decibels = toDecibels(value)
    const normalized = (decibels - HISTOGRAM_MIN_DB) / HISTOGRAM_SPAN_DB
    const bucket = Math.min(
      Math.max(Math.floor(normalized * HISTOGRAM_BUCKETS), 0),
      HISTOGRAM_BUCKETS - 1
    )
    histogram[bucket] = (histogram[bucket] ?? 0) + 1
  }

  return histogram
}

function percentileDecibels(
  histogram: Uint32Array,
  sampleCount: number,
  percentile: number
): number {
  const threshold = Math.max(1, Math.ceil(sampleCount * percentile))
  let cumulative = 0

  for (let bucket = 0; bucket < HISTOGRAM_BUCKETS; bucket += 1) {
    cumulative += histogram[bucket] ?? 0
    if (cumulative >= threshold) {
      return bucketToDecibels(bucket)
    }
  }

  return HISTOGRAM_MAX_DB
}

export function computeReferenceLevel(series: Float32Array): number {
  if (series.length === 0) {
    return 0
  }

  const histogram = computeDbHistogram(series)

  return (
    10 **
    (percentileDecibels(histogram, series.length, REFERENCE_PERCENTILE) / 20)
  )
}

export type BandNormalization = {
  lowDb: number
  spanDb: number
}

export function computeBandNormalization(
  series: Float32Array
): BandNormalization {
  if (series.length === 0) {
    return { lowDb: -DYNAMIC_RANGE_DB, spanDb: DYNAMIC_RANGE_DB }
  }

  const histogram = computeDbHistogram(series)
  const highDb = percentileDecibels(histogram, series.length, 0.99)
  const lowDb = percentileDecibels(histogram, series.length, 0.05)

  const spanDb = Math.min(
    Math.max(highDb - lowDb, MIN_NORMALIZATION_SPAN_DB),
    DYNAMIC_RANGE_DB
  )

  return { lowDb: highDb - spanDb, spanDb }
}

export function extractBandSeries(
  spectrogram: AudioSpectrogram,
  bandId: AudioBandId,
  config: AudioBandConfig
): Float32Array {
  if (isFullBandBand(bandId)) {
    return spectrogram.rms
  }

  const { bandCount, bands, centerHz, frameCount } = spectrogram
  const range = resolveSpectroBandRange(centerHz, config.lowHz, config.highHz)
  const width = range.endIndex - range.startIndex + 1
  const series = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const rowStart = frame * bandCount
    let sum = 0

    for (let index = range.startIndex; index <= range.endIndex; index += 1) {
      sum += bands[rowStart + index] ?? 0
    }

    series[frame] = width > 0 ? sum / width : 0
  }

  return series
}

export function smoothEnvelopeInPlace(
  envelope: Float32Array,
  attackMs: number,
  releaseMs: number,
  envelopeRate: number
): void {
  const hopSeconds = 1 / envelopeRate
  const attackCoefficient =
    1 - Math.exp(-hopSeconds / Math.max(attackMs / 1000, 1e-6))
  const releaseCoefficient =
    1 - Math.exp(-hopSeconds / Math.max(releaseMs / 1000, 1e-6))

  let current = 0

  for (let index = 0; index < envelope.length; index += 1) {
    const target = envelope[index] ?? 0
    const coefficient =
      target > current ? attackCoefficient : releaseCoefficient
    current += (target - current) * coefficient
    envelope[index] = current
  }
}

export type BandEnvelopeResult = {
  envelope: Float32Array
  silent: boolean
}

type BandMeasurement = {
  normalization: BandNormalization
  peak: number
  reference: number
  series: Float32Array
}

function measureBand(
  spectrogram: AudioSpectrogram,
  bandId: AudioBandId,
  config: AudioBandConfig
): BandMeasurement {
  const series = extractBandSeries(spectrogram, bandId, config)

  let peak = 0
  for (const value of series) {
    peak = Math.max(peak, value)
  }

  return {
    normalization: computeBandNormalization(series),
    peak,
    reference: computeReferenceLevel(series),
    series,
  }
}

function normalizeAndSmooth(
  measurement: BandMeasurement,
  config: AudioBandConfig,
  envelopeRate: number
): Float32Array {
  const { normalization, series } = measurement
  const { lowDb, spanDb } = normalization
  const envelope = new Float32Array(series.length)

  for (let index = 0; index < series.length; index += 1) {
    const decibels = toDecibels(series[index] ?? 0) + config.gainDb
    envelope[index] = clamp01((decibels - lowDb) / spanDb)
  }

  smoothEnvelopeInPlace(
    envelope,
    config.attackMs,
    config.releaseMs,
    envelopeRate
  )

  return envelope
}

function isSilent(measurement: BandMeasurement, referenceFloor: number): boolean {
  return (
    measurement.peak < SILENCE_REFERENCE_FLOOR ||
    measurement.reference < referenceFloor
  )
}

export function computeBandEnvelope(
  spectrogram: AudioSpectrogram,
  bandId: AudioBandId,
  config: AudioBandConfig,
  referenceFloor = 0
): BandEnvelopeResult {
  const measurement = measureBand(spectrogram, bandId, config)

  if (isSilent(measurement, referenceFloor)) {
    return {
      envelope: new Float32Array(measurement.series.length),
      silent: true,
    }
  }

  return {
    envelope: normalizeAndSmooth(
      measurement,
      config,
      spectrogram.envelopeRate
    ),
    silent: false,
  }
}

export function computeEnvelopeSet(
  spectrogram: AudioSpectrogram,
  bands: Record<AudioBandId, AudioBandConfig>
): AudioEnvelopeSet {
  const envelopes = {} as Record<AudioBandId, Float32Array>
  const silentBands: AudioBandId[] = []

  const measurements = {} as Record<AudioBandId, BandMeasurement>
  let loudestReference = 0

  for (const bandId of AUDIO_BAND_IDS) {
    const measurement = measureBand(spectrogram, bandId, bands[bandId])
    measurements[bandId] = measurement

    if (!isFullBandBand(bandId)) {
      loudestReference = Math.max(loudestReference, measurement.reference)
    }
  }

  const referenceFloor = loudestReference * 10 ** (-RELATIVE_SILENCE_DB / 20)

  for (const bandId of AUDIO_BAND_IDS) {
    const measurement = measurements[bandId]

    if (isSilent(measurement, isFullBandBand(bandId) ? 0 : referenceFloor)) {
      envelopes[bandId] = new Float32Array(measurement.series.length)
      silentBands.push(bandId)
      continue
    }

    envelopes[bandId] = normalizeAndSmooth(
      measurement,
      bands[bandId],
      spectrogram.envelopeRate
    )
  }

  return {
    bands: envelopes,
    durationSeconds: spectrogram.durationSeconds,
    envelopeRate: spectrogram.envelopeRate,
    sampleCount: spectrogram.frameCount,
    silentBands,
  }
}
