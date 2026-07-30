import {
  AUDIO_BAND_IDS,
  type AudioBandConfig,
  type AudioBandId,
} from "@/types/editor"

/** Envelope samples per second. Matches the rAF loop; lookup interpolates. */
export const ENVELOPE_RATE = 60

export const DEFAULT_FFT_SIZE = 2048

/**
 * Log-spaced magnitude bands retained per STFT frame. Far finer than needed to
 * place three boundaries (~1/7 octave), which is what lets the band editor
 * recompute envelopes without re-running the FFT. Doubles as spectrum-analyser
 * data for the advanced UI.
 */
export const SPECTRO_BAND_COUNT = 64

export const SPECTRO_MIN_HZ = 20
export const SPECTRO_MAX_HZ = 20000

/** dB window mapped onto `[0,1]` after normalization. */
export const DYNAMIC_RANGE_DB = 48

/** Below this, a band is treated as silent rather than amplified to noise. */
export const SILENCE_REFERENCE_FLOOR = 1e-6

/**
 * An envelope smoothed faster than the sample rate can represent will alias
 * when sampled at low export frame rates, so release is floored at one
 * envelope step.
 */
export const MIN_RELEASE_MS = 1000 / ENVELOPE_RATE

export const DEFAULT_AUDIO_BANDS: Record<AudioBandId, AudioBandConfig> = {
  bass: { attackMs: 8, gainDb: 0, highHz: 140, lowHz: 20, releaseMs: 140 },
  high: { attackMs: 6, gainDb: 0, highHz: 16000, lowHz: 2000, releaseMs: 90 },
  // `level` is full-band RMS; its lowHz/highHz are inert but kept for shape
  // uniformity so the UI can render one control set for every band.
  level: { attackMs: 20, gainDb: 0, highHz: 20000, lowHz: 20, releaseMs: 220 },
  mid: { attackMs: 8, gainDb: 0, highHz: 2000, lowHz: 140, releaseMs: 110 },
}

export function createDefaultAudioBands(): Record<
  AudioBandId,
  AudioBandConfig
> {
  const bands = {} as Record<AudioBandId, AudioBandConfig>

  for (const bandId of AUDIO_BAND_IDS) {
    bands[bandId] = { ...DEFAULT_AUDIO_BANDS[bandId] }
  }

  return bands
}

/** `level` ignores its frequency range because it is derived from RMS. */
export function isFullBandBand(bandId: AudioBandId): boolean {
  return bandId === "level"
}

export type SpectroBandLayout = {
  /** Geometric centre of each band, ascending. Length `bandCount`. */
  centerHz: Float32Array
  /** Band edges, ascending. Length `bandCount + 1`. */
  edgeHz: Float32Array
}

/**
 * Geometrically spaced band edges from {@link SPECTRO_MIN_HZ} up to the lesser
 * of {@link SPECTRO_MAX_HZ} and nyquist.
 */
export function createSpectroBandLayout(
  sampleRate: number,
  bandCount: number = SPECTRO_BAND_COUNT
): SpectroBandLayout {
  const nyquist = sampleRate / 2
  const maxHz = Math.min(SPECTRO_MAX_HZ, nyquist)
  const minHz = Math.min(SPECTRO_MIN_HZ, maxHz / 2)
  const ratio = maxHz / minHz

  const edgeHz = new Float32Array(bandCount + 1)
  for (let index = 0; index <= bandCount; index += 1) {
    edgeHz[index] = minHz * ratio ** (index / bandCount)
  }

  const centerHz = new Float32Array(bandCount)
  for (let index = 0; index < bandCount; index += 1) {
    const lower = edgeHz[index] ?? minHz
    const upper = edgeHz[index + 1] ?? maxHz
    centerHz[index] = Math.sqrt(lower * upper)
  }

  return { centerHz, edgeHz }
}

export type BinRange = {
  /** Inclusive. */
  endBin: number
  /** Inclusive, never 0 — the DC bin carries no musical information. */
  startBin: number
}

/**
 * FFT bins overlapping `[lowHz, highHz]`. Always excludes DC and always returns
 * at least one bin, so a narrow or inverted range degrades to a single bin
 * rather than producing an empty mean.
 */
export function frequencyToBinRange(
  lowHz: number,
  highHz: number,
  fftSize: number,
  sampleRate: number
): BinRange {
  const nyquistBin = Math.floor(fftSize / 2)

  if (!(Number.isFinite(lowHz) && Number.isFinite(highHz)) || sampleRate <= 0) {
    return { endBin: 1, startBin: 1 }
  }

  const lower = Math.min(lowHz, highHz)
  const upper = Math.max(lowHz, highHz)
  const binsPerHz = fftSize / sampleRate

  const startBin = Math.min(
    Math.max(Math.floor(lower * binsPerHz), 1),
    nyquistBin
  )
  const endBin = Math.min(
    Math.max(Math.ceil(upper * binsPerHz), startBin),
    nyquistBin
  )

  return { endBin, startBin }
}

export type SpectroBandRange = {
  /** Inclusive. */
  endIndex: number
  /** Inclusive. */
  startIndex: number
}

/**
 * Spectro bands whose centre falls inside `[lowHz, highHz)`. Falls back to the
 * single nearest band when the range is narrower than the spectro resolution,
 * so every band config yields a usable envelope.
 */
export function resolveSpectroBandRange(
  centerHz: Float32Array,
  lowHz: number,
  highHz: number
): SpectroBandRange {
  const bandCount = centerHz.length

  if (bandCount === 0) {
    return { endIndex: 0, startIndex: 0 }
  }

  const lower = Math.min(lowHz, highHz)
  const upper = Math.max(lowHz, highHz)

  let startIndex = -1
  let endIndex = -1

  for (let index = 0; index < bandCount; index += 1) {
    const center = centerHz[index] ?? 0
    if (center >= lower && center < upper) {
      if (startIndex === -1) {
        startIndex = index
      }
      endIndex = index
    }
  }

  if (startIndex !== -1) {
    return { endIndex, startIndex }
  }

  // No centre landed inside the range — snap to the nearest band.
  const target = (lower + upper) / 2
  let nearest = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < bandCount; index += 1) {
    const distance = Math.abs((centerHz[index] ?? 0) - target)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = index
    }
  }

  return { endIndex: nearest, startIndex: nearest }
}

/** Keeps a user-edited band config inside physically sensible bounds. */
export function clampBandConfig(
  config: AudioBandConfig,
  sampleRate = 48000
): AudioBandConfig {
  const nyquist = sampleRate / 2
  const lowHz = Math.min(Math.max(config.lowHz, 1), nyquist)
  const highHz = Math.min(Math.max(config.highHz, lowHz + 1), nyquist)

  return {
    attackMs: Math.min(Math.max(config.attackMs, 0), 2000),
    gainDb: Math.min(Math.max(config.gainDb, -24), 24),
    highHz,
    lowHz,
    releaseMs: Math.min(Math.max(config.releaseMs, MIN_RELEASE_MS), 4000),
  }
}
