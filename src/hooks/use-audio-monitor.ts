"use client"

import { useEffect } from "react"
import { isPreviewRenderLocked } from "@/lib/editor/preview-render-lock"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useTimelineStore } from "@/store/timeline-store"

const MAX_DRIFT_SECONDS = 0.15
const RESUME_SNAP_SECONDS = 0.02
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
    let wasAudible = false

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

    const shouldBeAudible = (): boolean => {
      if (currentUrl === null || !enabled) {
        return false
      }

      if (document.hidden || isPreviewRenderLocked()) {
        return false
      }

      const { frozen, isPlaying } = useTimelineStore.getState()

      return isPlaying && !frozen
    }

    const apply = (): void => {
      const audible = shouldBeAudible()

      if (!audible) {
        wasAudible = false

        if (!element.paused) {
          element.pause()
        }

        return
      }

      const drift = Math.abs(element.currentTime - targetTime())
      const tolerance = wasAudible ? MAX_DRIFT_SECONDS : RESUME_SNAP_SECONDS

      if (drift > tolerance) {
        element.currentTime = targetTime()
      }

      wasAudible = true

      if (element.paused) {
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

    const unsubscribeTimeline = useTimelineStore.subscribe((state) => {
      if (state.isPlaying !== lastPlaying || state.frozen !== lastFrozen) {
        lastPlaying = state.isPlaying
        lastFrozen = state.frozen
        apply()
        return
      }

      if (!wasAudible) {
        return
      }

      if (Math.abs(element.currentTime - targetTime()) > MAX_DRIFT_SECONDS) {
        apply()
      }
    })

    const unsubscribeAudio = useAudioStore.subscribe((state, previousState) => {
      if (state.source !== previousState.source) {
        applySource()
      }

      if (state.offsetSeconds !== previousState.offsetSeconds) {
        wasAudible = false
        apply()
      }
    })

    const unsubscribeAssets = useAssetStore.subscribe(applySource)

    document.addEventListener("visibilitychange", apply)

    applySource()

    const driftTimer = window.setInterval(apply, DRIFT_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(driftTimer)
      document.removeEventListener("visibilitychange", apply)
      unsubscribeTimeline()
      unsubscribeAudio()
      unsubscribeAssets()

      element.pause()
      element.removeAttribute("src")
      element.load()
    }
  }, [enabled])
}
