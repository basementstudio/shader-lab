"use client"

import { useEffect, useState } from "react"

const MOBILE_VIEWPORT_QUERY = "(max-width: 899px)"

export function useIsMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
      : false
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)

    const updateViewportMatch = () => {
      setIsMobileViewport(mediaQuery.matches)
    }

    updateViewportMatch()
    mediaQuery.addEventListener("change", updateViewportMatch)

    return () => {
      mediaQuery.removeEventListener("change", updateViewportMatch)
    }
  }, [])

  return isMobileViewport
}
