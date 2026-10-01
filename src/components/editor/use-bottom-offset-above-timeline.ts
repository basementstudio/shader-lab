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
      const fallback = window.innerWidth < 900 ? 104 : PILL_FALLBACK_BOTTOM_PX
      if (!shell) {
        setOffset(fallback)

        return
      }

      const rect = shell.getBoundingClientRect()
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        getComputedStyle(shell).visibility === "hidden"
      ) {
        setOffset(fallback)
        return
      }

      setOffset(
        Math.max(
          PILL_GAP_PX,
          Math.min(
            window.innerHeight - 96,
            Math.round(window.innerHeight - rect.top + PILL_GAP_PX)
          )
        )
      )
    }

    measure()

    const observer = shell ? new ResizeObserver(measure) : null

    if (shell && observer) {
      observer.observe(shell)
    }

    // FloatingDesktopPanel positions/reveals its wrapper after measuring size.
    // That move does not resize the shell, so ResizeObserver alone misses it.
    const positionObserver = new MutationObserver(measure)
    if (shell?.parentElement) {
      positionObserver.observe(shell.parentElement, {
        attributes: true,
        attributeFilter: ["style"],
      })
    }

    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      positionObserver.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [active])

  return offset
}
