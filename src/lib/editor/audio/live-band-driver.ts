"use client"

import { sampleBand } from "@/lib/editor/audio/envelope-lookup"
import {
  buildSpectrumPath,
  DEFAULT_SPECTRUM_DISPLAY,
  smoothSpectrumInto,
  spectrogramFrameAt,
  type SpectrumDisplayOptions,
  spectrumHeights,
} from "@/lib/editor/audio/spectrum-path"
import { useAudioStore } from "@/store/audio-store"
import { useTimelineStore } from "@/store/timeline-store"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"

type BandConsumer = {
  apply: (value: number) => void
  bandId: AudioBandId
  last: number
}

type SpectrumTarget = {
  element: SVGPathElement
  height: number
  heights: Float32Array
  smoothed: Float32Array
  width: number
}

const bandConsumers = new Set<BandConsumer>()
const spectrumTargets = new Set<SpectrumTarget>()

let subscriberCount = 0
let frameId: number | null = null

const WRITE_EPSILON = 0.004

export function registerBandConsumer(
  bandId: AudioBandId,
  apply: (value: number) => void
): () => void {
  const consumer: BandConsumer = { apply, bandId, last: Number.NaN }
  bandConsumers.add(consumer)

  return () => {
    bandConsumers.delete(consumer)
  }
}

export function registerSpectrumPath(
  element: SVGPathElement,
  size: { height: number; width: number }
): () => void {
  const target: SpectrumTarget = {
    element,
    height: size.height,
    heights: new Float32Array(0),
    smoothed: new Float32Array(0),
    width: size.width,
  }

  spectrumTargets.add(target)

  return () => {
    spectrumTargets.delete(target)
  }
}

function writeBandValues(): void {
  if (bandConsumers.size === 0) {
    return
  }

  const { envelopes, offsetSeconds } = useAudioStore.getState()
  const time = useTimelineStore.getState().currentTime

  const values = {} as Record<AudioBandId, number>
  for (const bandId of AUDIO_BAND_IDS) {
    values[bandId] = envelopes
      ? sampleBand(envelopes, bandId, offsetSeconds, time)
      : 0
  }

  for (const consumer of bandConsumers) {
    const next = values[consumer.bandId]

    if (Math.abs(next - consumer.last) < WRITE_EPSILON) {
      continue
    }

    consumer.last = next
    consumer.apply(next)
  }
}

function writeSpectrumPaths(): void {
  if (spectrumTargets.size === 0) {
    return
  }

  const { offsetSeconds, spectrogram } = useAudioStore.getState()
  const time = useTimelineStore.getState().currentTime + offsetSeconds

  if (!spectrogram) {
    for (const target of spectrumTargets) {
      target.element.setAttribute("d", "")
    }
    return
  }

  const frame = spectrogramFrameAt(spectrogram, time)

  if (!frame) {
    return
  }

  for (const target of spectrumTargets) {
    if (target.smoothed.length !== frame.length) {
      target.smoothed = new Float32Array(frame.length)
      target.heights = new Float32Array(frame.length)
    }

    smoothSpectrumInto(target.smoothed, frame)

    const options: SpectrumDisplayOptions = {
      ...DEFAULT_SPECTRUM_DISPLAY,
      height: target.height,
      width: target.width,
    }

    spectrumHeights(
      target.smoothed,
      spectrogram.centerHz,
      options,
      target.heights
    )

    target.element.setAttribute(
      "d",
      buildSpectrumPath(target.heights, spectrogram.centerHz, options)
    )
  }
}

function tick(): void {
  writeBandValues()
  writeSpectrumPaths()
  frameId = window.requestAnimationFrame(tick)
}

export function acquireLiveBandDriver(): () => void {
  if (typeof window === "undefined") {
    return () => undefined
  }

  subscriberCount += 1

  if (frameId === null) {
    frameId = window.requestAnimationFrame(tick)
  }

  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    subscriberCount -= 1

    if (subscriberCount <= 0 && frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
      subscriberCount = 0
    }
  }
}
