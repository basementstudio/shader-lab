"use client"

import { sampleBand } from "@/lib/editor/audio/envelope-lookup"
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

function writeBandValues(): void {
  const root = document.documentElement
  const { envelopes, offsetSeconds } = useAudioStore.getState()
  const time = useTimelineStore.getState().currentTime

  for (const bandId of AUDIO_BAND_IDS) {
    const value = envelopes
      ? sampleBand(envelopes, bandId, offsetSeconds, time)
      : 0

    root.style.setProperty(bandVariableNames[bandId], value.toFixed(4))
  }
}

function tick(): void {
  writeBandValues()
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
        root.style.setProperty(bandVariableNames[bandId], "0")
      }
    }
  }
}
