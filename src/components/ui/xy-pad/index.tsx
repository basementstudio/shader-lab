"use client"

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useMemo, useRef } from "react"
import { cn } from "@/lib/cn"

type XYPadProps = {
  className?: string
  label?: ReactNode
  max?: number
  min?: number
  onValueChange: (value: [number, number]) => void
  step?: number
  value: [number, number]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundToStep(value: number, step: number, min: number): number {
  if (!(Number.isFinite(step) && step > 0)) {
    return value
  }

  return Math.round((value - min) / step) * step + min
}

function formatValue(value: number): string {
  return value.toFixed(2)
}

export function XYPad({
  className,
  label,
  max = 1,
  min = -1,
  onValueChange,
  step = 0.01,
  value,
}: XYPadProps) {
  const surfaceRef = useRef<HTMLButtonElement | null>(null)
  const range = Math.max(max - min, Number.EPSILON)

  const style = useMemo(
    () =>
      ({
        "--xy-pad-display-x":
          "clamp(var(--xy-pad-handle-margin), var(--xy-pad-x), calc(100% - var(--xy-pad-handle-margin)))",
        "--xy-pad-display-y":
          "clamp(var(--xy-pad-handle-margin), var(--xy-pad-y), calc(100% - var(--xy-pad-handle-margin)))",
        "--xy-pad-handle-margin": "14px",
        "--xy-pad-x": `${((clamp(value[0], min, max) - min) / range) * 100}%`,
        "--xy-pad-y": `${(1 - (clamp(value[1], min, max) - min) / range) * 100}%`,
      }) as CSSProperties,
    [max, min, range, value],
  )

  const commitPosition = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current

    if (!surface) {
      return
    }

    const rect = surface.getBoundingClientRect()
    const normalizedX = clamp((clientX - rect.left) / rect.width, 0, 1)
    const normalizedY = clamp((clientY - rect.top) / rect.height, 0, 1)
    const nextX = clamp(roundToStep(min + normalizedX * range, step, min), min, max)
    const nextY = clamp(roundToStep(min + (1 - normalizedY) * range, step, min), min, max)

    onValueChange([nextX, nextY])
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    commitPosition(event.clientX, event.clientY)
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!(event.buttons & 1)) {
      return
    }

    commitPosition(event.clientX, event.clientY)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextX = value[0]
    let nextY = value[1]

    switch (event.key) {
      case "ArrowLeft":
        nextX -= step
        break
      case "ArrowRight":
        nextX += step
        break
      case "ArrowDown":
        nextY -= step
        break
      case "ArrowUp":
        nextY += step
        break
      default:
        return
    }

    event.preventDefault()
    onValueChange([
      clamp(roundToStep(nextX, step, min), min, max),
      clamp(roundToStep(nextY, step, min), min, max),
    ])
  }

  return (
    <div className={cn("flex w-full flex-col gap-[var(--ds-space-2)]", className)}>
      <div className="flex items-center justify-between gap-[var(--ds-space-3)]">
        <div className="inline-flex min-w-0 items-center gap-2">
          {label ? <span className="text-[11px] leading-[14px] font-normal text-white/45">{label}</span> : <span />}
          <span className="inline-flex min-h-[18px] items-center rounded-full border border-white/8 bg-white/6 px-1.5 font-[var(--ds-font-mono)] text-[10px] leading-3 text-[var(--ds-color-text-muted)]">
            X/Y
          </span>
        </div>
        <span className="shrink-0 text-right font-[var(--ds-font-mono)] text-[11px] leading-[14px] text-[var(--ds-color-text-secondary)]">
          {formatValue(value[0])}, {formatValue(value[1])}
        </span>
      </div>

      <button
        aria-label={typeof label === "string" ? label : "XY pad"}
        className="relative h-[156px] w-full cursor-crosshair overflow-hidden rounded-[calc(var(--ds-radius-control)+2px)] border border-white/8 bg-[radial-gradient(circle_at_center,rgb(255_255_255_/_0.05),transparent_58%),linear-gradient(180deg,rgb(255_255_255_/_0.04),rgb(255_255_255_/_0.01))] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)] touch-none focus-visible:outline-none focus-visible:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04),0_0_0_3px_rgb(255_255_255_/_0.12)] active:[&_.xy-handle]:scale-90"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        ref={surfaceRef}
        style={style}
        type="button"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255_/_0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_0.06)_1px,transparent_1px)] bg-center bg-[length:25%_25%]" />
        <div
          className="pointer-events-none absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255_/_0.28),transparent)] transition-[top] duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ top: "var(--xy-pad-display-y)" }}
        />
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-[linear-gradient(180deg,transparent,rgb(255_255_255_/_0.28),transparent)] transition-[left] duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ left: "var(--xy-pad-display-x)" }}
        />
        <div
          className="xy-handle pointer-events-none absolute h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 transition-[left,top,transform] duration-[260ms,260ms,120ms] ease-[cubic-bezier(0.34,1.56,0.64,1),cubic-bezier(0.34,1.56,0.64,1),var(--ease-out-cubic)] will-change-[left,top,transform]"
          style={{
            left: "var(--xy-pad-display-x)",
            top: "var(--xy-pad-display-y)",
          }}
        >
          <span className="block h-full w-full rounded-full border-2 border-white/14 bg-[radial-gradient(circle_at_30%_30%,rgb(255_255_255_/_0.95),rgb(255_255_255_/_0.76)),linear-gradient(180deg,rgb(255_255_255_/_0.2),rgb(255_255_255_/_0.06))] shadow-[0_10px_20px_rgb(0_0_0_/_0.26),0_0_0_6px_rgb(255_255_255_/_0.05)] transition-[background-color,box-shadow] duration-160 ease-[var(--ease-out-cubic)]" />
        </div>
      </button>
    </div>
  )
}
