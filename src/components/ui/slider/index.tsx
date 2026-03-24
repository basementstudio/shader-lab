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
      className={cn("flex w-full flex-col gap-[var(--ds-space-2)]", className)}
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
      <div className="flex items-center justify-between gap-[var(--ds-space-3)]">
        {label ? (
          <BaseSlider.Label className="text-[11px] leading-[14px] font-normal text-white/45">
            {label}
          </BaseSlider.Label>
        ) : (
          <span />
        )}
        <BaseSlider.Value className="shrink-0 text-right font-[var(--ds-font-mono)] text-[11px] leading-[14px] text-[var(--ds-color-text-secondary)]">
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
        className="relative flex min-h-5 w-full cursor-pointer items-center touch-none data-[disabled]:cursor-not-allowed"
        onPointerDownCapture={handlePointerDown}
        ref={controlRef}
      >
        <BaseSlider.Track className="relative h-1 flex-1 rounded-[2px] bg-white/10">
          <BaseSlider.Indicator className="h-full rounded-[2px] bg-white/25" />
        </BaseSlider.Track>
        <BaseSlider.Thumb className="relative h-3 w-4 overflow-visible transition-[transform,outline-offset] duration-120 ease-[var(--ease-out-cubic)] active:scale-[0.96] data-[dragging]:scale-[0.96] focus-visible:outline-none data-[disabled]:opacity-45">
          <span
            className="block h-full w-full rounded-[var(--ds-radius-thumb)] border-2 border-white/15 bg-white/85 shadow-[var(--ds-shadow-knob)] transition-[background-color,box-shadow,transform] duration-[160ms,160ms,260ms] ease-[var(--ease-out-cubic),var(--ease-out-cubic),cubic-bezier(0.34,1.56,0.64,1)] will-change-transform hover:bg-white/92 focus-visible:shadow-[var(--ds-shadow-knob),0_0_0_3px_rgb(255_255_255_/_0.12)]"
            style={{
              transform:
                "translateX(var(--slider-pull-x)) scaleX(var(--slider-pull-scale-x)) scaleY(var(--slider-pull-scale-y))",
              transformOrigin: "center",
            }}
          />
        </BaseSlider.Thumb>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}
