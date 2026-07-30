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

/**
 * Publishes live band values as CSS custom properties on the document root.
 *
 * Deliberately not React state. These change 60 times a second; routing them
 * through `useState` would re-render the properties sidebar every frame and make
 * any audio-driven slider fight the user's pointer. Meters and fills read
 * `var(--audio-band-bass)` directly, so the browser animates them with no React
 * involvement at all.
 *
 * Reference-counted singleton: many components can ask for it, one loop runs.
 */

const bandVariableNames: Record<AudioBandId, string> = {
  bass: "--audio-band-bass",
  high: "--audio-band-high",
  level: "--audio-band-level",
  mid: "--audio-band-mid",
}

export function getBandVariableName(bandId: AudioBandId): string {
  return bandVariableNames[bandId]
}

let subscriberCount = 0
let frameId: number | null = null

/**
 * Registered spectrum curves.
 *
 * The four band values fit in CSS custom properties, but a spectrum is ~64
 * numbers and a fresh path every frame, so it has to be written imperatively.
 * Still no React involvement — the element's `d` attribute is mutated directly.
 */
type SpectrumTarget = {
  element: SVGPathElement
  heights: Float32Array
  height: number
  smoothed: Float32Array
  width: number
}

const spectrumTargets = new Set<SpectrumTarget>()

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

const lastWritten: Record<AudioBandId, string> = {
  bass: "",
  high: "",
  level: "",
  mid: "",
}

function writeBandValues(): void {
  const root = document.documentElement
  const { envelopes, offsetSeconds } = useAudioStore.getState()
  const time = useTimelineStore.getState().currentTime

  for (const bandId of AUDIO_BAND_IDS) {
    const value = envelopes
      ? sampleBand(envelopes, bandId, offsetSeconds, time)
      : 0
    // Two decimals is below what is visible at meter/dot size, and coarsening
    // here means a held or silent passage stops writing at all.
    const next = value.toFixed(2)

    // Setting a custom property on the root invalidates style for the whole
    // document, so skip writes that would not change anything.
    if (lastWritten[bandId] !== next) {
      lastWritten[bandId] = next
      root.style.setProperty(bandVariableNames[bandId], next)
    }
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

/** Start the driver (if needed) and return a release function. */
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

      const root = document.documentElement
      for (const bandId of AUDIO_BAND_IDS) {
        lastWritten[bandId] = "0"
        root.style.setProperty(bandVariableNames[bandId], "0")
      }
    }
  }
}
