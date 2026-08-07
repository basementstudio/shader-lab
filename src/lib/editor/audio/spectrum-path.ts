import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"

export type SpectrumDisplayOptions = {
  ceilingDb: number
  floorDb: number
  height: number
  tiltDbPerDecade: number
  width: number
}

export const DEFAULT_SPECTRUM_DISPLAY: Omit<
  SpectrumDisplayOptions,
  "height" | "width"
> = {
  ceilingDb: -6,
  floorDb: -72,
  tiltDbPerDecade: 4.5,
}

export const SPECTRUM_RISE_COEFFICIENT = 0.5
export const SPECTRUM_FALL_COEFFICIENT = 0.12

const REFERENCE_FRAME_SECONDS = 1 / 60

const MAGNITUDE_EPSILON = 1e-9

function timeConstant(coefficient: number): number {
  return -REFERENCE_FRAME_SECONDS / Math.log(1 - coefficient)
}

const SPECTRUM_RISE_TAU = timeConstant(SPECTRUM_RISE_COEFFICIENT)
const SPECTRUM_FALL_TAU = timeConstant(SPECTRUM_FALL_COEFFICIENT)

export function smoothSpectrumInto(
  smoothed: Float32Array,
  frame: Float32Array,
  deltaSeconds = REFERENCE_FRAME_SECONDS
): void {
  const count = Math.min(smoothed.length, frame.length)
  const delta =
    Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? Math.min(deltaSeconds, 0.25)
      : REFERENCE_FRAME_SECONDS

  const rise = 1 - Math.exp(-delta / SPECTRUM_RISE_TAU)
  const fall = 1 - Math.exp(-delta / SPECTRUM_FALL_TAU)

  for (let index = 0; index < count; index += 1) {
    const target = frame[index] ?? 0
    const current = smoothed[index] ?? 0
    const coefficient = target > current ? rise : fall

    smoothed[index] = current + (target - current) * coefficient
  }
}

export function spectrumHeights(
  magnitudes: Float32Array,
  centerHz: Float32Array,
  options: SpectrumDisplayOptions,
  out: Float32Array
): Float32Array {
  const count = Math.min(magnitudes.length, centerHz.length, out.length)

  if (count === 0) {
    return out
  }

  const lowestHz = Math.max(centerHz[0] ?? 1, 1)
  const span = Math.max(options.ceilingDb - options.floorDb, 1e-6)

  for (let index = 0; index < count; index += 1) {
    const magnitude = Math.max(magnitudes[index] ?? 0, MAGNITUDE_EPSILON)
    const decibels = 20 * Math.log10(magnitude)
    const decades = Math.log10(Math.max(centerHz[index] ?? lowestHz, 1) / lowestHz)
    const tilted = decibels + decades * options.tiltDbPerDecade

    out[index] = Math.min(
      Math.max((tilted - options.floorDb) / span, 0),
      1
    )
  }

  return out
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export type SpectrumPathScratch = {
  centerHz: Float32Array | null
  width: number
  xs: Float32Array
  ys: Float32Array
}

export function createSpectrumPathScratch(): SpectrumPathScratch {
  return {
    centerHz: null,
    width: 0,
    xs: new Float32Array(0),
    ys: new Float32Array(0),
  }
}

export function buildSpectrumPath(
  heights: Float32Array,
  centerHz: Float32Array,
  options: SpectrumDisplayOptions,
  scratch?: SpectrumPathScratch
): string {
  const count = Math.min(heights.length, centerHz.length)

  if (count < 2) {
    return ""
  }

  const buffers = scratch ?? createSpectrumPathScratch()

  if (buffers.xs.length !== count) {
    buffers.xs = new Float32Array(count)
    buffers.ys = new Float32Array(count)
    buffers.centerHz = null
  }

  const { xs, ys } = buffers

  if (buffers.centerHz !== centerHz || buffers.width !== options.width) {
    const lowestHz = Math.max(centerHz[0] ?? 1, 1)
    const highestHz = Math.max(
      centerHz[count - 1] ?? lowestHz * 10,
      lowestHz * 10
    )
    const decadeSpan = Math.max(Math.log10(highestHz / lowestHz), 1e-6)

    for (let index = 0; index < count; index += 1) {
      const hz = Math.max(centerHz[index] ?? lowestHz, 1)
      xs[index] = (Math.log10(hz / lowestHz) / decadeSpan) * options.width
    }

    buffers.centerHz = centerHz
    buffers.width = options.width
  }

  for (let index = 0; index < count; index += 1) {
    ys[index] = options.height * (1 - (heights[index] ?? 0))
  }

  const firstX = xs[0] ?? 0
  const baseline = round(options.height)

  let path = `M${round(firstX)} ${baseline}L${round(firstX)} ${round(ys[0] ?? 0)}`

  for (let index = 0; index < count - 1; index += 1) {
    const previousIndex = index === 0 ? 0 : index - 1
    const nextIndex = index + 2 > count - 1 ? count - 1 : index + 2

    const previousX = xs[previousIndex] ?? 0
    const previousY = ys[previousIndex] ?? 0
    const startX = xs[index] ?? 0
    const startY = ys[index] ?? 0
    const endX = xs[index + 1] ?? 0
    const endY = ys[index + 1] ?? 0
    const nextX = xs[nextIndex] ?? 0
    const nextY = ys[nextIndex] ?? 0

    const control1X = startX + (endX - previousX) / 6
    const control1Y = startY + (endY - previousY) / 6
    const control2X = endX - (nextX - startX) / 6
    const control2Y = endY - (nextY - startY) / 6

    path += `C${round(control1X)} ${round(control1Y)} ${round(control2X)} ${round(control2Y)} ${round(endX)} ${round(endY)}`
  }

  path += `L${round(xs[count - 1] ?? 0)} ${baseline}Z`

  return path
}

export function spectrogramFrameAt(
  spectrogram: AudioSpectrogram,
  time: number
): Float32Array | null {
  if (spectrogram.frameCount === 0 || !Number.isFinite(time)) {
    return null
  }

  const frame = Math.min(
    Math.max(Math.round(time * spectrogram.envelopeRate), 0),
    spectrogram.frameCount - 1
  )
  const start = frame * spectrogram.bandCount

  return spectrogram.bands.subarray(start, start + spectrogram.bandCount)
}
