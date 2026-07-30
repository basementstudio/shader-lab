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
 */

/** Re-seek only past this much drift; correcting every frame is very audible. */
const MAX_DRIFT_SECONDS = 0.15

export function useAudioMonitor(enabled: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const element = document.createElement("audio")
    element.preload = "auto"
    element.loop = false

    let disposed = false
    let frameId: number | null = null
    let currentUrl: string | null = null

    const sync = () => {
      frameId = window.requestAnimationFrame(sync)

      const audioState = useAudioStore.getState()
      const source = audioState.source
      const url =
        source?.kind === "asset"
          ? (useAssetStore.getState().getAssetById(source.assetId)?.url ?? null)
          : null

      if (url !== currentUrl) {
        currentUrl = url
        element.src = url ?? ""

        if (!url) {
          element.pause()
        }
      }

      if (!(enabled && url)) {
        if (!element.paused) {
          element.pause()
        }
        return
      }

      const timeline = useTimelineStore.getState()
      const target = timeline.currentTime + audioState.offsetSeconds
      const clampedTarget = Math.max(0, target)

      if (!timeline.isPlaying || timeline.frozen) {
        if (!element.paused) {
          element.pause()
        }

        // Keep position aligned while scrubbing so playback resumes in sync.
        if (Math.abs(element.currentTime - clampedTarget) > MAX_DRIFT_SECONDS) {
          element.currentTime = clampedTarget
        }
        return
      }

      if (Math.abs(element.currentTime - clampedTarget) > MAX_DRIFT_SECONDS) {
        element.currentTime = clampedTarget
      }

      if (element.paused) {
        // Rejected until the user has interacted with the page; harmless to retry.
        void element.play().catch(() => undefined)
      }
    }

    frameId = window.requestAnimationFrame(sync)

    return () => {
      disposed = true

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      element.pause()
      element.removeAttribute("src")
      element.load()

      void disposed
    }
  }, [enabled])
}
