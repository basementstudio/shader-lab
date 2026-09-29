"use client"

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
} from "react"
import {
  NumberInput,
  numberInputControlClassName,
} from "@/components/ui/number-input"
import { cn } from "@/lib/cn"

const AXIS_COLORS: Record<string, string> = {
  X: "#ff3352",
  Y: "#8bdc00",
  Z: "#2890ff",
}

type Scrub = {
  axis: number
  pointer: number
  startValue: number
  startX: number
  moved: boolean
}

function clamp(value: number, min: number | undefined, max: number | undefined) {
  return Math.min(max ?? value, Math.max(min ?? value, value))
}

function decimalsFor(step: number): number {
  return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
}

export function AxisFields({
  axes,
  label,
  max,
  min,
  onInteractionEnd,
  onInteractionStart,
  onValueChange,
  step = 0.01,
  value,
}: {
  axes: readonly string[]
  label: ReactNode
  max?: number | undefined
  min?: number | undefined
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  onValueChange: (value: number[]) => void
  step?: number
  value: readonly number[]
}) {
  const scrub = useRef<Scrub | null>(null)
  const latest = useRef(value)
  latest.current = value
  const decimals = decimalsFor(step)

  const commit = (axis: number, next: number) => {
    const values = [...latest.current]
    const rounded = Number(clamp(next, min, max).toFixed(decimals))
    if (values[axis] === rounded) return
    values[axis] = rounded
    onValueChange(values)
  }

  const beginScrub = (axis: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    scrub.current = {
      axis,
      moved: false,
      pointer: event.pointerId,
      startValue: latest.current[axis] ?? 0,
      startX: event.clientX,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onInteractionStart?.()
  }

  const moveScrub = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const active = scrub.current
    if (!active || active.pointer !== event.pointerId) return
    const distance = event.clientX - active.startX
    if (!active.moved && Math.abs(distance) < 2) return
    active.moved = true
    let rate = 1
    if (event.shiftKey) rate = 0.1
    else if (event.altKey) rate = 10
    commit(active.axis, active.startValue + distance * step * rate)
  }

  const endScrub = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const active = scrub.current
    if (!active || active.pointer !== event.pointerId) return
    scrub.current = null
    onInteractionEnd?.()
  }

  return (
    <div className="flex flex-col gap-2">
      {label}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${axes.length}, minmax(0, 1fr))` }}
      >
        {axes.map((axis, index) => (
          <div
            className="relative flex min-w-0 items-center"
            data-axis-field={axis}
            key={axis}
          >
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-0 z-[1] flex w-5 cursor-ew-resize select-none items-center justify-center font-[var(--ds-font-mono)] text-[10px] leading-none"
              onLostPointerCapture={endScrub}
              onPointerCancel={endScrub}
              onPointerDown={beginScrub(index)}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              style={{ color: AXIS_COLORS[axis] ?? "var(--ds-color-text-secondary)" }}
            >
              {axis}
            </span>
            <NumberInput
              aria-label={`${axis}`}
              className={cn(numberInputControlClassName, "pl-5 tabular-nums")}
              formatValue={(entry) => entry.toFixed(decimals)}
              max={max}
              min={min}
              onChange={(next) => commit(index, next)}
              step={step}
              value={value[index] ?? 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
