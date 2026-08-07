import {
  type BinRange,
  createSpectroBandLayout,
  DEFAULT_FFT_SIZE,
  ENVELOPE_RATE,
  frequencyToBinRange,
  SPECTRO_BAND_COUNT,
} from "@/lib/editor/audio/bands"
import {
  computeFrameMagnitudes,
  createFftWorkspace,
  type FftWorkspace,
} from "@/lib/editor/audio/fft"

export type AudioSpectrogram = {
  bands: Float32Array
  bandCount: number
  centerHz: Float32Array
  durationSeconds: number
  envelopeRate: number
  fftSize: number
  frameCount: number
  rms: Float32Array
  sampleRate: number
}

export type SpectrogramOptions = {
  bandCount?: number
  envelopeRate?: number
  fftSize?: number
}

const PROGRESS_FRAME_INTERVAL = 256

type ReductionPlan = {
  bandCount: number
  binRanges: BinRange[]
  centerHz: Float32Array
  windowEnergy: number
}

function createReductionPlan(
  workspace: FftWorkspace,
  sampleRate: number,
  bandCount: number
): ReductionPlan {
  const layout = createSpectroBandLayout(sampleRate, bandCount)
  const binRanges: BinRange[] = []

  for (let index = 0; index < bandCount; index += 1) {
    binRanges.push(
      frequencyToBinRange(
        layout.edgeHz[index] ?? 0,
        layout.edgeHz[index + 1] ?? 0,
        workspace.size,
        sampleRate
      )
    )
  }

  let windowEnergy = 0
  for (let index = 0; index < workspace.size; index += 1) {
    const coefficient = workspace.window[index] ?? 0
    windowEnergy += coefficient * coefficient
  }

  return {
    bandCount,
    binRanges,
    centerHz: layout.centerHz,
    windowEnergy: windowEnergy > 0 ? windowEnergy : 1,
  }
}

function computeWindowedRms(
  workspace: FftWorkspace,
  samples: Float32Array,
  offset: number,
  windowEnergy: number
): number {
  let weighted = 0

  for (let index = 0; index < workspace.size; index += 1) {
    const sampleIndex = offset + index
    if (sampleIndex < 0 || sampleIndex >= samples.length) {
      continue
    }

    const coefficient = workspace.window[index] ?? 0
    const sample = samples[sampleIndex] ?? 0
    weighted += coefficient * coefficient * sample * sample
  }

  return Math.sqrt(weighted / windowEnergy)
}

export function* analyzeSpectrogramStepwise(
  samples: Float32Array,
  sampleRate: number,
  options: SpectrogramOptions = {}
): Generator<number, AudioSpectrogram, void> {
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE
  const envelopeRate = options.envelopeRate ?? ENVELOPE_RATE
  const bandCount = options.bandCount ?? SPECTRO_BAND_COUNT

  if (sampleRate <= 0) {
    throw new Error(`sampleRate must be positive, received ${sampleRate}`)
  }

  const workspace = createFftWorkspace(fftSize)
  const plan = createReductionPlan(workspace, sampleRate, bandCount)

  const hopSamples = Math.max(1, Math.round(sampleRate / envelopeRate))
  const frameCount = Math.max(1, Math.ceil(samples.length / hopSamples))
  const halfWindow = Math.floor(fftSize / 2)

  const bands = new Float32Array(frameCount * bandCount)
  const rms = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * hopSamples - halfWindow

    const magnitudes = computeFrameMagnitudes(workspace, samples, offset)
    const rowStart = frame * bandCount

    for (let band = 0; band < bandCount; band += 1) {
      const range = plan.binRanges[band]
      if (!range) {
        continue
      }

      let sum = 0
      let count = 0
      for (let bin = range.startBin; bin <= range.endBin; bin += 1) {
        sum += magnitudes[bin] ?? 0
        count += 1
      }

      bands[rowStart + band] = count > 0 ? sum / count : 0
    }

    rms[frame] = computeWindowedRms(
      workspace,
      samples,
      offset,
      plan.windowEnergy
    )

    if (frame % PROGRESS_FRAME_INTERVAL === 0) {
      yield frame / frameCount
    }
  }

  yield 1

  return {
    bandCount,
    bands,
    centerHz: plan.centerHz,
    durationSeconds: samples.length / sampleRate,
    envelopeRate: sampleRate / hopSamples,
    fftSize,
    frameCount,
    rms,
    sampleRate,
  }
}

export function analyzeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  options: SpectrogramOptions = {}
): AudioSpectrogram {
  const iterator = analyzeSpectrogramStepwise(samples, sampleRate, options)

  let step = iterator.next()
  while (!step.done) {
    step = iterator.next()
  }

  return step.value
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0]

  if (!first) {
    return new Float32Array(0)
  }

  if (channels.length === 1) {
    return first
  }

  const mono = new Float32Array(first.length)

  for (const channel of channels) {
    for (let index = 0; index < mono.length; index += 1) {
      mono[index] = (mono[index] ?? 0) + (channel[index] ?? 0)
    }
  }

  for (let index = 0; index < mono.length; index += 1) {
    mono[index] = (mono[index] ?? 0) / channels.length
  }

  return mono
}
