"use client"

import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react"
import { ColorPicker } from "@/components/ui/color-picker"
import { cn } from "@/lib/cn"
import type { UISoundId } from "@/lib/audio/shader-lab-sounds"
import { playOptionalUISound } from "@/lib/audio/shader-lab-sounds"

export type GradientStop = { color: string; position: number }

type GradientRampProps = {
  className?: string
  label?: ReactNode
  maxStops?: number
  onChange: (stops: GradientStop[]) => void
  stops: GradientStop[]
  uiSoundEnd?: UISoundId | "none"
  uiSoundStart?: UISoundId | "none"
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function buildGradientCSS(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const parts = sorted.map(
    (stop) => `${stop.color} ${(stop.position * 100).toFixed(1)}%`
  )
  return `linear-gradient(90deg, ${parts.join(", ")})`
}

export function GradientRamp({
  className,
  label,
  maxStops = 5,
  onChange,
  stops,
  uiSoundEnd = "generic.dragEnd",
  uiSoundStart = "generic.dragStart",
}: GradientRampProps) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const sorted = [...stops]
    .map((stop, originalIndex) => ({ ...stop, originalIndex }))
    .sort((a, b) => a.position - b.position)

  const toPosition = useCallback((clientX: number): number => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return clamp((clientX - rect.left) / rect.width, 0, 1)
  }, [])

  const handleStopPointerDown = useCallback(
    (index: number, e: PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      ;(e.target as HTMLButtonElement).setPointerCapture(e.pointerId)
      setDragIndex(index)
      setSelectedIndex(index)
      playOptionalUISound(uiSoundStart)
    },
    [uiSoundStart]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (dragIndex === null) return
      const position = toPosition(e.clientX)
      const updated = stops.map((stop, i) =>
        i === dragIndex ? { ...stop, position } : stop
      )
      onChange(updated)
    },
    [dragIndex, onChange, stops, toPosition]
  )

  const handlePointerUp = useCallback(() => {
    if (dragIndex !== null) {
      playOptionalUISound(uiSoundEnd)
    }
    setDragIndex(null)
  }, [dragIndex, uiSoundEnd])

  const handleBarClick = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (dragIndex !== null) return
      if (stops.length >= maxStops) return
      const target = e.target as HTMLElement
      if (target.closest("button")) return

      const position = toPosition(e.clientX)
      const newStop: GradientStop = { color: "#808080", position }
      const updated = [...stops, newStop].sort(
        (a, b) => a.position - b.position
      )
      onChange(updated)
      setSelectedIndex(updated.indexOf(newStop))
    },
    [dragIndex, maxStops, onChange, stops, toPosition]
  )

  const handleDelete = useCallback(
    (index: number) => {
      if (stops.length <= 2) return
      const updated = stops.filter((_, i) => i !== index)
      onChange(updated)
      setSelectedIndex(null)
    },
    [onChange, stops]
  )

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const updated = stops.map((stop, i) =>
        i === index ? { ...stop, color } : stop
      )
      onChange(updated)
    },
    [onChange, stops]
  )

  return (
    <div
      className={cn("flex w-full flex-col gap-[var(--ds-space-2)]", className)}
    >
      {label && (
        <span className="text-[11px] leading-[14px] font-normal text-white/45">
          {label}
        </span>
      )}

      {/* Gradient bar */}
      <div
        className="relative h-7 w-full cursor-crosshair overflow-visible rounded-[calc(var(--ds-radius-control)+2px)] border border-white/8 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]"
        onPointerDown={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={barRef}
      >
        {/* Checkerboard for transparency */}
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ background: buildGradientCSS(stops) }}
        />

        {/* Stop handles */}
        {sorted.map((stop) => (
          <button
            className={cn(
              "absolute top-1/2 h-4 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[3px] border-2 shadow-[0_1px_3px_rgb(0_0_0_/_0.4)] transition-[transform,box-shadow] duration-120 ease-out active:cursor-grabbing",
              selectedIndex === stop.originalIndex
                ? "scale-110 border-white shadow-[0_0_0_1px_rgb(255_255_255_/_0.3),0_2px_6px_rgb(0_0_0_/_0.4)]"
                : "border-white/70 hover:scale-105"
            )}
            key={stop.originalIndex}
            onDoubleClick={() => handleDelete(stop.originalIndex)}
            onPointerDown={(e) => handleStopPointerDown(stop.originalIndex, e)}
            style={{
              backgroundColor: stop.color,
              left: `${stop.position * 100}%`,
            }}
            type="button"
          />
        ))}
      </div>

      {/* Selected stop color editor */}
      {selectedIndex !== null && stops[selectedIndex] && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] leading-[14px] text-[var(--ds-color-text-muted)]">
            Stop {selectedIndex + 1}
          </span>
          <ColorPicker
            onValueChange={(color) => handleColorChange(selectedIndex, color)}
            value={stops[selectedIndex].color}
          />
        </div>
      )}

      {stops.length > 2 && selectedIndex !== null && (
        <span className="text-[10px] leading-3 text-[var(--ds-color-text-muted)]">
          Double-click a stop to remove it
        </span>
      )}
    </div>
  )
}
