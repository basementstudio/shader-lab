"use client"

import { useEffect } from "react"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useTimelineStore } from "@/store/timeline-store"

/**
 * Plays the project audio source while the timeline plays, so the editor is not
 * silent while parameters visibly react to music.
 *
 * The element is always a *slave* of `timeline.currentTime`, never the clock.
 * The timeline drives rendering and the offline exporter depends on it, so
 * letting audio lead would make playback position unreproducible.
 *
 * Deliberately event-driven rather than a per-frame loop. Transport changes are
 * rare, and drift correction is a ~4Hz concern; an earlier version polled this
 * on `requestAnimationFrame`, which meant an always-on 60Hz loop doing store
 * reads and an asset lookup even for users who never loaded any audio.
 */

/** Re-seek only past this much drift; correcting constantly is very audible. */
const MAX_DRIFT_SECONDS = 0.15

/** Drift accumulates slowly, so checking this often is plenty. */
const DRIFT_CHECK_INTERVAL_MS = 250

export function useAudioMonitor(enabled: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const element = document.createElement("audio")
    element.preload = "auto"
    element.loop = false

    let currentUrl: string | null = null
    let lastPlaying: boolean | null = null
    let lastFrozen: boolean | null = null

    const resolveUrl = (): string | null => {
      const source = useAudioStore.getState().source

      if (source?.kind !== "asset") {
        return null
      }

      return useAssetStore.getState().getAssetById(source.assetId)?.url ?? null
    }

    const targetTime = (): number => {
      const { currentTime } = useTimelineStore.getState()

      return Math.max(currentTime + useAudioStore.getState().offsetSeconds, 0)
    }

    /** Bring the element in line with the transport. Safe to call repeatedly. */
    const apply = (): void => {
      if (currentUrl === null) {
        if (!element.paused) {
          element.pause()
        }
        return
      }

      const { frozen, isPlaying } = useTimelineStore.getState()

      if (!(enabled && isPlaying) || frozen) {
        if (!element.paused) {
          element.pause()
        }
        return
      }

      if (Math.abs(element.currentTime - targetTime()) > MAX_DRIFT_SECONDS) {
        element.currentTime = targetTime()
      }

      if (element.paused) {
        // Rejected until the user has interacted with the page; harmless to retry.
        void element.play().catch(() => undefined)
      }
    }

    const applySource = (): void => {
      const url = resolveUrl()

      if (url === currentUrl) {
        return
      }

      currentUrl = url

      if (url) {
        element.src = url
      } else {
        element.pause()
        element.removeAttribute("src")
        element.load()
      }

      apply()
    }

    // Fires on every timeline change, including each frame of playback, so this
    // must stay a couple of comparisons in the common case.
    const unsubscribeTimeline = useTimelineStore.subscribe((state) => {
      if (state.isPlaying === lastPlaying && state.frozen === lastFrozen) {
        return
      }

      lastPlaying = state.isPlaying
      lastFrozen = state.frozen
      apply()
    })

    const unsubscribeAudio = useAudioStore.subscribe(applySource)

    applySource()

    const driftTimer = window.setInterval(() => {
      if (currentUrl === null) {
        return
      }

      const { frozen, isPlaying } = useTimelineStore.getState()

      // While paused or scrubbing, keep the position aligned so resuming is in
      // sync. It is inaudible either way, so precision does not matter here.
      if (!isPlaying || frozen) {
        if (Math.abs(element.currentTime - targetTime()) > MAX_DRIFT_SECONDS) {
          element.currentTime = targetTime()
        }
        return
      }

      apply()
    }, DRIFT_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(driftTimer)
      unsubscribeTimeline()
      unsubscribeAudio()

      element.pause()
      element.removeAttribute("src")
      element.load()
    }
  }, [enabled])
}
