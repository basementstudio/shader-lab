"use client"

import { useCallback, useEffect, useRef } from "react"
import { registerBandConsumer } from "@/lib/editor/audio/live-band-driver"
import type { AudioBandId } from "@/types/editor"

/**
 * Binds an element's style to a live audio band, bypassing React entirely.
 *
 * `write` runs up to 60 times a second, so it must only touch style — never
 * state. The driver skips writes whose value has not visibly changed.
 *
 * Returns a **callback ref**, not an object ref, on purpose. Several of these
 * elements live inside popover content that mounts long after the component
 * holding the hook, and an effect keyed on mount alone would run while the ref
 * was still null and silently never register.
 *
 * Changing `bandId` changes the callback's identity, so React detaches and
 * reattaches it, which re-registers against the new band for free.
 *
 * Pass `null` as the band to unbind, e.g. for a parameter that is not linked.
 */
export function useBandValueElement<T extends HTMLElement | SVGElement>(
  bandId: AudioBandId | null,
  write: (element: T, value: number) => void
): (element: T | null) => void {
  const writeRef = useRef(write)
  writeRef.current = write

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
