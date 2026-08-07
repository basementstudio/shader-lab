"use client"

import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import { sampleBand } from "@/lib/editor/audio/envelope-lookup"
import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"
import {
  buildSpectrumPath,
  createSpectrumPathScratch,
  DEFAULT_SPECTRUM_DISPLAY,
  smoothSpectrumInto,
  spectrogramFrameAt,
  type SpectrumDisplayOptions,
  type SpectrumPathScratch,
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
  heights: Float32Array
  lastPath: string
  options: SpectrumDisplayOptions
  scratch: SpectrumPathScratch
  smoothed: Float32Array
}

type DriverFrame = {
  deltaSeconds: number
  envelopes: AudioEnvelopeSet | null
  offsetSeconds: number
  spectrogram: AudioSpectrogram | null
  time: number
}

const bandConsumers = new Set<BandConsumer>()
const spectrumTargets = new Set<SpectrumTarget>()

let subscriberCount = 0
let frameId: number | null = null

const WRITE_EPSILON = 0.004

const IDLE_SETTLE_FRAMES = 30

const bandValues = {} as Record<AudioBandId, number>

let idleFrames = 0
let lastTickAt = Number.NaN
let lastTime = Number.NaN
let lastOffset = Number.NaN
let lastEnvelopes: AudioEnvelopeSet | null = null
let lastSpectrogram: AudioSpectrogram | null = null

function resetIdleTracking(): void {
  idleFrames = 0
  lastTickAt = Number.NaN
  lastTime = Number.NaN
  lastOffset = Number.NaN
  lastEnvelopes = null
  lastSpectrogram = null
}

function retainDriver(): void {
  subscriberCount += 1

  if (frameId === null && typeof window !== "undefined") {
    resetIdleTracking()
    frameId = window.requestAnimationFrame(tick)
  }
}

function releaseDriver(): void {
  subscriberCount = Math.max(0, subscriberCount - 1)

  if (subscriberCount === 0 && frameId !== null) {
    window.cancelAnimationFrame(frameId)
    frameId = null
  }
}

export function registerBandConsumer(
  bandId: AudioBandId,
  apply: (value: number) => void
): () => void {
  const consumer: BandConsumer = { apply, bandId, last: Number.NaN }
  bandConsumers.add(consumer)
  retainDriver()

  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    bandConsumers.delete(consumer)
    releaseDriver()
  }
}

export function registerSpectrumPath(
  element: SVGPathElement,
  size: { height: number; width: number }
): () => void {
  const target: SpectrumTarget = {
    element,
    heights: new Float32Array(0),
    lastPath: "",
    options: {
      ...DEFAULT_SPECTRUM_DISPLAY,
      height: size.height,
      width: size.width,
    },
    scratch: createSpectrumPathScratch(),
    smoothed: new Float32Array(0),
  }

  spectrumTargets.add(target)
  retainDriver()

  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    spectrumTargets.delete(target)
    releaseDriver()
  }
}

function writeBandValues(frame: DriverFrame): void {
  if (bandConsumers.size === 0) {
    return
  }

  for (const bandId of AUDIO_BAND_IDS) {
    bandValues[bandId] = frame.envelopes
      ? sampleBand(frame.envelopes, bandId, frame.offsetSeconds, frame.time)
      : 0
  }

  for (const consumer of bandConsumers) {
    const next = bandValues[consumer.bandId]

    if (Math.abs(next - consumer.last) < WRITE_EPSILON) {
      continue
    }

    consumer.last = next
    consumer.apply(next)
  }
}

function setPath(target: SpectrumTarget, path: string): void {
  if (target.lastPath === path) {
    return
  }

  target.lastPath = path
  target.element.setAttribute("d", path)
}

function writeSpectrumPaths(driverFrame: DriverFrame): void {
  if (spectrumTargets.size === 0) {
    return
  }

  const { spectrogram } = driverFrame
  const frame = spectrogram
    ? spectrogramFrameAt(spectrogram, driverFrame.time + driverFrame.offsetSeconds)
    : null

  if (!(spectrogram && frame)) {
    for (const target of spectrumTargets) {
      setPath(target, "")
    }
    return
  }

  for (const target of spectrumTargets) {
    if (target.smoothed.length !== frame.length) {
      target.smoothed = new Float32Array(frame.length)
      target.heights = new Float32Array(frame.length)
    }

    smoothSpectrumInto(target.smoothed, frame, driverFrame.deltaSeconds)

    spectrumHeights(
      target.smoothed,
      spectrogram.centerHz,
      target.options,
      target.heights
    )

    setPath(
      target,
      buildSpectrumPath(
        target.heights,
        spectrogram.centerHz,
        target.options,
        target.scratch
      )
    )
  }
}

function tick(now: number): void {
  const { envelopes, offsetSeconds, spectrogram } = useAudioStore.getState()
  const time = useTimelineStore.getState().currentTime
  const deltaSeconds = Number.isFinite(lastTickAt) ? (now - lastTickAt) / 1000 : 0
  lastTickAt = now

  if (
    time === lastTime &&
    offsetSeconds === lastOffset &&
    envelopes === lastEnvelopes &&
    spectrogram === lastSpectrogram
  ) {
    idleFrames += 1
  } else {
    idleFrames = 0
    lastTime = time
    lastOffset = offsetSeconds
    lastEnvelopes = envelopes
    lastSpectrogram = spectrogram
  }

  if (idleFrames <= IDLE_SETTLE_FRAMES) {
    const driverFrame: DriverFrame = {
      deltaSeconds,
      envelopes,
      offsetSeconds,
      spectrogram,
      time,
    }

    writeBandValues(driverFrame)
    writeSpectrumPaths(driverFrame)
  }

  frameId = window.requestAnimationFrame(tick)
}
