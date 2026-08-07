"use client"

import { useCallback, useEffect, useRef } from "react"
import { registerBandConsumer } from "@/lib/editor/audio/live-band-driver"
import type { AudioBandId } from "@/types/editor"

export function useBandValueElement<T extends HTMLElement | SVGElement>(
  bandId: AudioBandId | null,
  write: (element: T, value: number) => void
): (element: T | null) => void {
  const writeRef = useRef(write)

  useEffect(() => {
    writeRef.current = write
  })

  const unregisterRef = useRef<(() => void) | null>(null)

  const bind = useCallback(
    (element: T | null) => {
      unregisterRef.current?.()
      unregisterRef.current = null

      if (!(element && bandId)) {
        return
      }

      unregisterRef.current = registerBandConsumer(bandId, (value) => {
        writeRef.current(element, value)
      })
    },
    [bandId]
  )

  useEffect(
    () => () => {
      unregisterRef.current?.()
      unregisterRef.current = null
    },
    []
  )

  return bind
}
