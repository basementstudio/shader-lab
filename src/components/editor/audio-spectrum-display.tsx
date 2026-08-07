"use client"

import { useEffect, useRef } from "react"
import {
  createSpectroBandLayout,
  SPECTRO_MAX_HZ,
  SPECTRO_MIN_HZ,
} from "@/lib/editor/audio/bands"
import { registerSpectrumPath } from "@/lib/editor/audio/live-band-driver"
import { useAudioStore } from "@/store"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"
import { Typography } from "@/components/ui/typography"

const VIEW_WIDTH = 300
const VIEW_HEIGHT = 84

const BAND_LABELS: Record<AudioBandId, string> = {
  bass: "Bass",
  high: "High",
  level: "Level",
  mid: "Mid",
}

function frequencyToFraction(hz: number, lowestHz: number, highestHz: number) {
  const decades = Math.log10(Math.max(highestHz / lowestHz, 1e-6))
  const position = Math.log10(Math.max(hz, 1) / lowestHz) / decades

  return Math.min(Math.max(position, 0), 1)
}

export function AudioSpectrumDisplay() {
  const pathRef = useRef<SVGPathElement | null>(null)
  const bands = useAudioStore((state) => state.bands)
  const sampleRate = useAudioStore((state) => state.spectrogram?.sampleRate)

  useEffect(() => {
    const element = pathRef.current

    if (!element) {
      return
    }

    return registerSpectrumPath(element, {
      height: VIEW_HEIGHT,
      width: VIEW_WIDTH,
    })
  }, [])

  const layout = createSpectroBandLayout(sampleRate ?? 48000)
  const lowestHz = layout.centerHz[0] ?? SPECTRO_MIN_HZ
  const highestHz = layout.centerHz.at(-1) ?? SPECTRO_MAX_HZ

  const frequencyBands = AUDIO_BAND_IDS.filter((bandId) => bandId !== "level")
  const boundaries = frequencyBands.map((bandId) => ({
    bandId,
    endFraction: frequencyToFraction(bands[bandId].highHz, lowestHz, highestHz),
    startFraction: frequencyToFraction(bands[bandId].lowHz, lowestHz, highestHz),
  }))

  return (
    <div className="flex flex-col gap-1">
      <div className="relative overflow-hidden rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[rgb(10_10_14_/_0.6)]">
        <svg
          aria-hidden="true"
          className="block h-[84px] w-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          <title>Audio spectrum</title>

          {boundaries.map((boundary) => (
            <rect
              fill="rgb(182 151 255 / 0.05)"
              height={VIEW_HEIGHT}
              key={boundary.bandId}
              width={Math.max(
                (boundary.endFraction - boundary.startFraction) * VIEW_WIDTH,
                0
              )}
              x={boundary.startFraction * VIEW_WIDTH}
              y={0}
            />
          ))}

          {boundaries.slice(1).map((boundary) => (
            <line
              key={`divider-${boundary.bandId}`}
              stroke="rgb(255 255 255 / 0.1)"
              strokeWidth="1"
              x1={boundary.startFraction * VIEW_WIDTH}
              x2={boundary.startFraction * VIEW_WIDTH}
              y1={0}
              y2={VIEW_HEIGHT}
            />
          ))}

          <path
            d=""
            fill="rgb(182 151 255 / 0.22)"
            ref={pathRef}
            stroke="rgb(196 172 255 / 0.85)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="relative h-3">
        {boundaries.map((boundary) => (
          <Typography
            as="span"
            className="absolute -translate-x-1/2"
            key={`label-${boundary.bandId}`}
            style={{
              left: `${((boundary.startFraction + boundary.endFraction) / 2) * 100}%`,
            }}
            tone="muted"
            variant="caption"
          >
            {BAND_LABELS[boundary.bandId]}
          </Typography>
        ))}
      </div>
    </div>
  )
}
