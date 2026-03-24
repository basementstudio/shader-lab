"use client"

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useMemo, useRef } from "react"
import { cn } from "@/lib/cn"
import s from "./xy-pad.module.css"

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
    <div className={cn(s.root, className)}>
      <div className={s.header}>
        <div className={s.labelWrap}>
          {label ? <span className={s.label}>{label}</span> : <span />}
          <span className={s.axisTag}>X/Y</span>
        </div>
        <span className={s.value}>
          {formatValue(value[0])}, {formatValue(value[1])}
        </span>
      </div>

      <button
        aria-label={typeof label === "string" ? label : "XY pad"}
        className={s.surface}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        ref={surfaceRef}
        style={style}
        type="button"
      >
        <div className={s.grid} />
        <div className={s.crosshairX} />
        <div className={s.crosshairY} />
        <div className={s.handle}>
          <span className={s.handleCore} />
        </div>
      </button>
    </div>
  )
}
