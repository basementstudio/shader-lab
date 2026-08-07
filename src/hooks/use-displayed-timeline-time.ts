"use client"

import { useEffect, useState } from "react"
import { useTimelineStore } from "@/store/timeline-store"

const PLAYBACK_UPDATE_MS = 50

export function useDisplayedTimelineTime(enabled: boolean): number {
  const [time, setTime] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setTime(0)
      return
    }

    let lastEmittedAt = 0
    let pending: number | null = null
    let timer: number | null = null

    const emit = (value: number) => {
      lastEmittedAt = performance.now()
      pending = null
      setTime(value)
    }

    const flush = () => {
      timer = null

      if (pending !== null) {
        emit(pending)
      }
    }

    emit(useTimelineStore.getState().currentTime)

    const unsubscribe = useTimelineStore.subscribe((state, previousState) => {
      if (state.currentTime === previousState.currentTime) {
        return
      }

      if (!state.isPlaying) {
        if (timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }

        emit(state.currentTime)
        return
      }

      const elapsed = performance.now() - lastEmittedAt

      if (elapsed >= PLAYBACK_UPDATE_MS) {
        emit(state.currentTime)
        return
      }

      pending = state.currentTime

      if (timer === null) {
        timer = window.setTimeout(flush, PLAYBACK_UPDATE_MS - elapsed)
      }
    })

    return () => {
      unsubscribe()

      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [enabled])

  return time
}
