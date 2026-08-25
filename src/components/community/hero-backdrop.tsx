"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { SceneViewer } from "@/components/community/scene-viewer"

const IDLE_TIMEOUT_MS = 1_200
const SATURATION = 2
const SCALE = 1.6
const SCRIM_CENTER = 0.57
const SCRIM_MID = 0.43
const SCRIM_EDGE = 0.4

export function HeroBackdrop({
  hasCameraLayer,
  labUrl,
  posterUrl,
}: {
  hasCameraLayer: boolean
  labUrl: string
  posterUrl: string | null
}) {
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (hasCameraLayer) {
      return
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const idle = window.requestIdleCallback

    if (!idle) {
      const timer = window.setTimeout(() => setLive(true), IDLE_TIMEOUT_MS)

      return () => window.clearTimeout(timer)
    }

    const handle = idle(() => setLive(true), { timeout: IDLE_TIMEOUT_MS })

    return () => window.cancelIdleCallback(handle)
  }, [hasCameraLayer])

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          filter: `saturate(${SATURATION})`,
          transform: `scale(${SCALE})`,
        }}
      >
        {posterUrl ? (
          <Image
            alt=""
            className="object-cover"
            fill
            priority
            sizes="100vw"
            src={posterUrl}
          />
        ) : null}

        {live ? <SceneViewer hasCameraLayer={false} labUrl={labUrl} /> : null}
      </div>

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, rgb(4 5 7 / ${SCRIM_CENTER}) 0%, rgb(4 5 7 / ${SCRIM_MID}) 45%, rgb(4 5 7 / ${SCRIM_EDGE}) 100%)`,
        }}
      />
    </div>
  )
}
