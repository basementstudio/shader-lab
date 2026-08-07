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

const MAGNITUDE_EPSILON = 1e-9

export function smoothSpectrumInto(
  smoothed: Float32Array,
  frame: Float32Array
): void {
  const count = Math.min(smoothed.length, frame.length)

  for (let index = 0; index < count; index += 1) {
    const target = frame[index] ?? 0
    const current = smoothed[index] ?? 0
    const coefficient =
      target > current ? SPECTRUM_RISE_COEFFICIENT : SPECTRUM_FALL_COEFFICIENT

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

export function buildSpectrumPath(
  heights: Float32Array,
  centerHz: Float32Array,
  options: SpectrumDisplayOptions
): string {
  const count = Math.min(heights.length, centerHz.length)

  if (count < 2) {
    return ""
  }

  const lowestHz = Math.max(centerHz[0] ?? 1, 1)
  const highestHz = Math.max(centerHz[count - 1] ?? lowestHz * 10, lowestHz * 10)
  const decadeSpan = Math.max(Math.log10(highestHz / lowestHz), 1e-6)

  const xs = new Float32Array(count)
  const ys = new Float32Array(count)

  for (let index = 0; index < count; index += 1) {
    const hz = Math.max(centerHz[index] ?? lowestHz, 1)
    xs[index] = (Math.log10(hz / lowestHz) / decadeSpan) * options.width
    ys[index] = options.height * (1 - (heights[index] ?? 0))
  }

  const at = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), count - 1)

    return { x: xs[clamped] ?? 0, y: ys[clamped] ?? 0 }
  }

  const first = at(0)
  const segments: string[] = [
    `M${round(first.x)} ${round(options.height)}`,
    `L${round(first.x)} ${round(first.y)}`,
  ]

  for (let index = 0; index < count - 1; index += 1) {
    const previous = at(index - 1)
    const start = at(index)
    const end = at(index + 1)
    const next = at(index + 2)

    const control1X = start.x + (end.x - previous.x) / 6
    const control1Y = start.y + (end.y - previous.y) / 6
    const control2X = end.x - (next.x - start.x) / 6
    const control2Y = end.y - (next.y - start.y) / 6

    segments.push(
      `C${round(control1X)} ${round(control1Y)} ${round(control2X)} ${round(control2Y)} ${round(end.x)} ${round(end.y)}`
    )
  }

  const last = at(count - 1)
  segments.push(`L${round(last.x)} ${round(options.height)}`, "Z")

  return segments.join("")
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
