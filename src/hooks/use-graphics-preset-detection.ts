"use client"

import { useEffect } from "react"
import {
  adjustPresetFromFps,
  detectInitialPreset,
  sampleMedianFps,
} from "@/lib/editor/graphics-preset-detection"
import { useGraphicsPresetStore } from "@/store/graphics-preset-store"
import { useMetricsStore } from "@/store/metrics-store"

export function useGraphicsPresetDetection() {
  useEffect(() => {
    const { hasDetected } = useGraphicsPresetStore.getState()

    if (hasDetected) {
      return
    }

    const controller = new AbortController()

    async function runDetection() {
      const initial = await detectInitialPreset()

      if (controller.signal.aborted) {
        return
      }

      useGraphicsPresetStore.getState().setDetected(initial)

      const medianFps = await sampleMedianFps({
        getFps: () => useMetricsStore.getState().fps,
        signal: controller.signal,
      })

      if (controller.signal.aborted) {
        return
      }

      const adjusted = adjustPresetFromFps(initial, medianFps)

      if (adjusted !== initial) {
        useGraphicsPresetStore.getState().setDetected(adjusted)
      }
    }

    void runDetection()

    return () => {
      controller.abort()
    }
  }, [])
}
