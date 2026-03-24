"use client"

import { Slider as BaseSlider } from "@base-ui/react/slider"
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/cn"
import s from "./slider.module.css"

type SliderProps = Omit<BaseSlider.Root.Props<number>, "children" | "className"> & {
  className?: string
  label?: ReactNode
  valueFormatOptions?: Intl.NumberFormatOptions
  valuePrefix?: string
  valueSuffix?: string
}

const MAX_PULL = 8
const PULL_DAMPING = 0.22
function clampPullOffset(value: number) {
  return Math.max(-MAX_PULL, Math.min(MAX_PULL, value * PULL_DAMPING))
}

export function Slider({
  className,
  defaultValue,
  label,
  locale,
  max = 100,
  min = 0,
  onValueChange,
  style,
  value,
  valueFormatOptions,
  valuePrefix,
  valueSuffix,
  ...props
}: SliderProps) {
  const controlRef = useRef<HTMLDivElement | null>(null)
  const [isVisualDragging, setIsVisualDragging] = useState(false)
  const [pullOffset, setPullOffset] = useState(0)
  let initialValue = min

  if (typeof defaultValue === "number") {
    initialValue = defaultValue
  }

  if (typeof value === "number") {
    initialValue = value
  }
  const [, setCurrentValueState] = useState(initialValue)

  useEffect(() => {
    if (typeof value === "number") {
      setCurrentValueState(value)
    }
  }, [value])

  const updatePullOffset = useEffectEvent((clientX: number) => {
    const control = controlRef.current

    if (!control) {
      return
    }

    const rect = control.getBoundingClientRect()

    if (clientX < rect.left) {
      setPullOffset(clampPullOffset(clientX - rect.left))
      return
    }

    if (clientX > rect.right) {
      setPullOffset(clampPullOffset(clientX - rect.right))
      return
    }

    setPullOffset(0)
  })

  const handlePointerMove = useEffectEvent((event: PointerEvent) => {
    updatePullOffset(event.clientX)
  })

  const resetPull = useEffectEvent(() => {
    setIsVisualDragging(false)
    setPullOffset(0)
  })

  useEffect(() => {
    if (!isVisualDragging) {
      return
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", resetPull)
    window.addEventListener("pointercancel", resetPull)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", resetPull)
      window.removeEventListener("pointercancel", resetPull)
    }
  }, [isVisualDragging])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setIsVisualDragging(true)
    updatePullOffset(event.clientX)
  }

  const pullIntensity = Math.min(Math.abs(pullOffset) / MAX_PULL, 1)
  const thumbScaleX = 1 + pullIntensity * 0.08
  const thumbScaleY = 1 - pullIntensity * 0.05
  const sliderStyle = {
    ...(style ?? {}),
    "--slider-pull-scale-x": thumbScaleX.toString(),
    "--slider-pull-scale-y": thumbScaleY.toString(),
    "--slider-pull-x": `${pullOffset}px`,
  } as CSSProperties

  const handleValueChange = (
    nextValue: number,
    eventDetails: BaseSlider.Root.ChangeEventDetails
  ) => {
    if (typeof value !== "number") {
      setCurrentValueState(nextValue)
    }

    onValueChange?.(nextValue, eventDetails)
  }

  return (
    <BaseSlider.Root
      className={cn(s.root, className)}
      data-visual-dragging={isVisualDragging ? "" : undefined}
      defaultValue={defaultValue}
      locale={locale}
      max={max}
      min={min}
      onValueChange={handleValueChange}
      style={sliderStyle}
      value={value}
      {...props}
    >
      <div className={s.header}>
        {label ? <BaseSlider.Label className={s.label}>{label}</BaseSlider.Label> : <span />}
        <BaseSlider.Value className={s.value}>
          {(formattedValues, values) => {
            const rawValue = values[0] ?? 0
            const formattedValue =
              valueFormatOptions
                ? new Intl.NumberFormat(locale, valueFormatOptions).format(rawValue)
                : (formattedValues[0] ?? rawValue.toString())

            return `${valuePrefix ?? ""}${formattedValue}${valueSuffix ?? ""}`
          }}
        </BaseSlider.Value>
      </div>

      <BaseSlider.Control
        className={s.control}
        onPointerDownCapture={handlePointerDown}
        ref={controlRef}
      >
        <BaseSlider.Track className={s.track}>
          <BaseSlider.Indicator className={s.indicator} />
        </BaseSlider.Track>
        <BaseSlider.Thumb className={s.thumb}>
          <span className={s.thumbVisual} />
        </BaseSlider.Thumb>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}
