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

/**
 * Stage B output: one normalized, smoothed envelope per band. Cheap to rebuild
 * from a cached {@link AudioSpectrogram}, which is what makes editing band
 * frequency ranges feel instant.
 *
 * Every sample is guaranteed to lie in `[0,1]` — normalization clamps and a
 * one-pole filter cannot exceed its input range. Downstream modulation relies
 * on this.
 */
export type AudioEnvelopeSet = {
  bands: Record<AudioBandId, Float32Array>
  durationSeconds: number
  envelopeRate: number
  sampleCount: number
  /** Bands with no usable energy, so the UI can explain a dead control. */
  silentBands: AudioBandId[]
}

const HISTOGRAM_BUCKETS = 1024
const HISTOGRAM_MIN_DB = -120
const HISTOGRAM_MAX_DB = 20
const HISTOGRAM_SPAN_DB = HISTOGRAM_MAX_DB - HISTOGRAM_MIN_DB

/** Floor for the log of a magnitude, so silence maps to the bottom of the range. */
const MAGNITUDE_EPSILON = 1e-9

/** Fraction of frames allowed to exceed the reference level and clip at 1.0. */
const REFERENCE_PERCENTILE = 0.99

/**
 * A frequency band this far below the loudest frequency band is treated as
 * silent.
 *
 * Necessary because normalization is per-band: without a gate, a band
 * containing nothing but FFT spectral leakage would have its own tiny reference
 * level and therefore normalize that leakage up to full scale — a bass-only
 * track would show a fake, full-swing "high" band that merely tracks the bass.
 * 60 dB is far below the spread between bands in real music, so this only ever
 * catches bands with genuinely no content.
 */
const RELATIVE_SILENCE_DB = 60

/**
 * Floor on the self-calibrating normalization span. Without it, a band whose
 * level barely changes would have its tiny variation stretched to a full 0-to-1
 * swing, turning noise into apparent signal.
 */
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

/**
 * dB-domain histogram of a series. O(n), no per-sample allocation and no sort,
 * so percentiles over an 18k-frame track cost one pass.
 */
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

/**
 * Reference level for the cross-band silence gate: the
 * {@link REFERENCE_PERCENTILE} of the series.
 *
 * Deliberately not the peak — one clap or one clipped sample would otherwise
 * dominate, misreporting how much content a band really has.
 */
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
  /** Input dB that maps to 0. */
  lowDb: number
  /** dB span mapped onto `[0,1]`. */
  spanDb: number
}

/**
 * Self-calibrating normalization window, derived from the band's own dB
 * distribution: the 5th percentile maps to 0 and the 99th to 1.
 *
 * A *fixed* dB window cannot work across real material. Measured against a
 * loudness-compressed master, a 48dB window left every band clustered between
 * 0.7 and 0.95 — visually static, because a mastered track's band energy only
 * varies 10-20dB. Anchoring to the track's own distribution means every band
 * uses the full range whether the source is a compressed club master or a
 * dynamic acoustic recording.
 *
 * The span is clamped: {@link MIN_NORMALIZATION_SPAN_DB} stops a nearly
 * constant band from being stretched into a full-swing signal built from noise,
 * and {@link DYNAMIC_RANGE_DB} caps how much of a very dynamic track's range is
 * compressed into `[0,1]`.
 */
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

/**
 * Raw per-frame magnitude series for one band: the mean of the spectro bands
 * overlapping its frequency range, or the precomputed RMS track for `level`.
 */
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

/**
 * One-pole asymmetric smoothing. Applied *after* normalization so the `[0,1]`
 * invariant is preserved: a one-pole filter is a convex blend of its previous
 * output and its input, so it can never leave their shared range.
 */
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

/**
 * Extract a band's raw series along with the two statistics the gate and
 * normalization need. Measuring once and reusing the result is what keeps stage
 * B cheap enough to run on every band-config change.
 */
function measureBand(
  spectrogram: AudioSpectrogram,
  bandId: AudioBandId,
  config: AudioBandConfig
): BandMeasurement {
  const series = extractBandSeries(spectrogram, bandId, config)

  // Absolute silence is detected from the peak, not the reference level: the
  // histogram's lowest bucket maps to a small-but-nonzero magnitude, so an
  // all-zero series would otherwise slip past a reference-based check.
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
    // dB rather than linear magnitude: perceptually proportional, so a value
    // driven by it tracks how loud the music *sounds*.
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

/**
 * Stage B for a single band.
 *
 * `referenceFloor` gates bands with no real content; pass 0 to disable. See
 * {@link RELATIVE_SILENCE_DB}.
 */
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

/**
 * Stage B for every band. Pure and fast (sub-millisecond for a 5 minute track),
 * so it can run synchronously on every band-config change.
 */
export function computeEnvelopeSet(
  spectrogram: AudioSpectrogram,
  bands: Record<AudioBandId, AudioBandConfig>
): AudioEnvelopeSet {
  const envelopes = {} as Record<AudioBandId, Float32Array>
  const silentBands: AudioBandId[] = []

  // Measure every band once, then gate relative to the loudest *frequency*
  // band. `level` is excluded from the comparison because it is derived from
  // RMS and so is not on a scale comparable to the magnitude means.
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
