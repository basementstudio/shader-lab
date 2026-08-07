"use client"

import { useMemo } from "react"
import { sampleEnvelopeWindow } from "@/lib/editor/audio/envelope-lookup"
import { useAudioStore } from "@/store"
import type { AudioBandId } from "@/types/editor"

const PEAK_COUNT = 220
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 100

function buildBackdropPath(peaks: Float32Array): string {
  if (peaks.length < 2) {
    return ""
  }

  const step = VIEW_WIDTH / (peaks.length - 1)
  const segments: string[] = [`M0 ${VIEW_HEIGHT}`]

  for (let index = 0; index < peaks.length; index += 1) {
    const x = Math.round(index * step * 10) / 10
    const y = Math.round((VIEW_HEIGHT - (peaks[index] ?? 0) * VIEW_HEIGHT) * 10) / 10
    segments.push(`L${x} ${y}`)
  }

  segments.push(`L${VIEW_WIDTH} ${VIEW_HEIGHT}`, "Z")

  return segments.join("")
}

export function AudioEnvelopeBackdrop({
  bandId,
  durationSeconds,
}: {
  bandId: AudioBandId
  durationSeconds: number
}) {
  const envelopes = useAudioStore((state) => state.envelopes)
  const offsetSeconds = useAudioStore((state) => state.offsetSeconds)

  const path = useMemo(() => {
    if (!envelopes) {
      return ""
    }

    return buildBackdropPath(
      sampleEnvelopeWindow(
        envelopes,
        bandId,
        offsetSeconds,
        durationSeconds,
        PEAK_COUNT
      )
    )
  }, [bandId, durationSeconds, envelopes, offsetSeconds])

  if (!path) {
    return null
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    >
      <path d={path} fill="rgb(182 151 255 / 0.10)" />
      <path
        d={path}
        fill="none"
        stroke="rgb(196 172 255 / 0.28)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
