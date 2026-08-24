"use client"

import { useEffect, useState } from "react"
import { SceneViewer } from "@/components/community/scene-viewer"

const IDLE_TIMEOUT_MS = 1_200

export function HeroScenePreview({
  hasCameraLayer,
  labUrl,
}: {
  hasCameraLayer: boolean
  labUrl: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const idle = window.requestIdleCallback

    if (!idle) {
      const timer = window.setTimeout(() => setMounted(true), IDLE_TIMEOUT_MS)

      return () => window.clearTimeout(timer)
    }

    const handle = idle(() => setMounted(true), { timeout: IDLE_TIMEOUT_MS })

    return () => window.cancelIdleCallback(handle)
  }, [])

  if (!mounted) {
    return null
  }

  return <SceneViewer hasCameraLayer={hasCameraLayer} labUrl={labUrl} />
}
