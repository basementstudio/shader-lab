"use client"

import { useEffect, useState } from "react"

const PILL_GAP_PX = 10
const PILL_FALLBACK_BOTTOM_PX = 68

export function useBottomOffsetAboveTimeline(active: boolean): number {
  const [offset, setOffset] = useState(PILL_FALLBACK_BOTTOM_PX)

  useEffect(() => {
    if (!active) {
      return
    }

    const shell = document.querySelector("[data-timeline-shell]")

    const measure = () => {
      if (!shell) {
        setOffset(PILL_FALLBACK_BOTTOM_PX)

        return
      }

      const rect = shell.getBoundingClientRect()

      setOffset(
        Math.max(
          PILL_GAP_PX,
          Math.round(window.innerHeight - rect.top + PILL_GAP_PX)
        )
      )
    }

    measure()

    const observer = shell ? new ResizeObserver(measure) : null

    if (shell && observer) {
      observer.observe(shell)
    }

    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active])

  return offset
}
