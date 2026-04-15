"use client"

import { Slider as BaseSlider } from "@base-ui/react/slider"
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/cn"

type SliderProps = Omit<
  BaseSlider.Root.Props<number>,
  "children" | "className"
> & {
  className?: string
  label?: ReactNode
  onInteractionStart?: (() => void) | undefined
  valueFormatOptions?: Intl.NumberFormatOptions
  valuePrefix?: string
  valueSuffix?: string
}

const MAX_PULL = 8
const PULL_DAMPING = 0.22
function clampPullOffset(value: number) {
  return Math.max(-MAX_PULL, Math.min(MAX_PULL, value * PULL_DAMPING))
}

function parseDraftValue(value: string) {
  const normalized = value.trim().replaceAll(",", ".")

  if (normalized.length === 0) {
    return null
  }

  const nextValue = Number.parseFloat(normalized)
  return Number.isFinite(nextValue) ? nextValue : null
}

export function Slider({
  className,
  defaultValue,
  label,
  locale,
  max = 100,
  min = 0,
  onInteractionStart,
  onValueCommitted,
  onValueChange,
  style,
  value,
  valueFormatOptions,
  valuePrefix,
  valueSuffix,
  ...props
}: SliderProps) {
  const controlRef = useRef<HTMLDivElement | null>(null)
  const gestureActiveRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const [isVisualDragging, setIsVisualDragging] = useState(false)
  const [isEditingValue, setIsEditingValue] = useState(false)
  const [draftValue, setDraftValue] = useState("")
  const [pullOffset, setPullOffset] = useState(0)
  const currentValue =
    value ??
    (Array.isArray(defaultValue) ? defaultValue[0] : defaultValue) ??
    min

  const formattedValue = valueFormatOptions
    ? new Intl.NumberFormat(locale, valueFormatOptions).format(currentValue)
    : currentValue.toString()
  const displayValue = `${valuePrefix ?? ""}${formattedValue}${valueSuffix ?? ""}`

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
    gestureActiveRef.current = false
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

  useEffect(() => {
    if (isEditingValue) {
      return
    }

    setDraftValue(formattedValue)
  }, [formattedValue, isEditingValue])

  useEffect(() => {
    if (!isEditingValue) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditingValue])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setIsVisualDragging((current) => (current ? current : true))
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
    if (!gestureActiveRef.current) {
      gestureActiveRef.current = true
      onInteractionStart?.()
    }

    onValueChange?.(nextValue, eventDetails)
  }

  const handleValueCommitted = (
    nextValue: number,
    eventDetails: Parameters<
      NonNullable<BaseSlider.Root.Props<number>["onValueCommitted"]>
    >[1]
  ) => {
    onValueCommitted?.(nextValue, eventDetails)
    resetPull()
  }

  const commitInputValue = useEffectEvent(() => {
    const parsedValue = parseDraftValue(draftValue)

    if (parsedValue === null) {
      setDraftValue(formattedValue)
      setIsEditingValue(false)
      return
    }

    const clampedValue = Math.min(max, Math.max(min, parsedValue))
    const changeDetails =
      undefined as unknown as BaseSlider.Root.ChangeEventDetails
    const commitDetails = undefined as unknown as Parameters<
      NonNullable<BaseSlider.Root.Props<number>["onValueCommitted"]>
    >[1]

    onInteractionStart?.()
    onValueChange?.(clampedValue, changeDetails)
    onValueCommitted?.(clampedValue, commitDetails)
    resetPull()
    setDraftValue(
      valueFormatOptions
        ? new Intl.NumberFormat(locale, valueFormatOptions).format(clampedValue)
        : clampedValue.toString()
    )
    setIsEditingValue(false)
  })

  const cancelValueEditing = useEffectEvent(() => {
    setDraftValue(formattedValue)
    setIsEditingValue(false)
  })

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitInputValue()
      event.currentTarget.blur()
      return
    }

    if (event.key === "Escape") {
      cancelValueEditing()
      event.currentTarget.blur()
    }
  }

  return (
    <BaseSlider.Root
      className={cn(
        "flex min-w-0 w-full flex-col gap-[var(--ds-space-2)]",
        className
      )}
      data-visual-dragging={isVisualDragging ? "" : undefined}
      defaultValue={defaultValue}
      locale={locale}
      max={max}
      min={min}
      onValueChange={handleValueChange}
      onValueCommitted={handleValueCommitted}
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
        <span
          className="inline-flex w-16 shrink-0 justify-end"
          data-ds-value=""
        >
          <span className="relative inline-flex pb-px">
            {isEditingValue ? (
              <input
                aria-label={
                  typeof label === "string" ? `${label} value` : "Slider value"
                }
                className="h-[14px] border-none bg-transparent p-0 text-right text-[11px] leading-[14px] text-[var(--ds-color-text-primary)] outline-none transition-[color] duration-160 ease-[var(--ease-out-cubic)]"
                id={inputId}
                inputMode="decimal"
                onBlur={commitInputValue}
                onChange={(event) => setDraftValue(event.currentTarget.value)}
                onKeyDown={handleInputKeyDown}
                ref={inputRef}
                spellCheck={false}
                style={{ width: `${Math.max(draftValue.length, 1)}ch` }}
                type="text"
                value={draftValue}
              />
            ) : (
              <button
                aria-controls={inputId}
                aria-label={
                  typeof label === "string"
                    ? `Edit ${label} value`
                    : "Edit slider value"
                }
                className="cursor-pointer border-none bg-transparent p-0 text-right text-[11px] leading-[14px] text-[var(--ds-color-text-secondary)] transition-[color] duration-160 ease-[var(--ease-out-cubic)] hover:text-[var(--ds-color-text-primary)]"
                onClick={() => {
                  setDraftValue(formattedValue)
                  setIsEditingValue(true)
                }}
                type="button"
              >
                {displayValue}
              </button>
            )}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-px origin-center bg-[var(--ds-border-active)] transition-[opacity,transform] duration-160 ease-[var(--ease-out-cubic)]",
                isEditingValue
                  ? "scale-x-100 opacity-100"
                  : "scale-x-50 opacity-0"
              )}
            />
          </span>
        </span>
      </div>

      <BaseSlider.Control
        className="relative flex min-h-5 w-full cursor-grab items-center touch-none active:cursor-grabbing data-[disabled]:cursor-not-allowed"
        onPointerDownCapture={handlePointerDown}
        ref={controlRef}
      >
        <BaseSlider.Track className="relative h-1 flex-1 rounded-[2px] bg-white/10">
          <BaseSlider.Indicator className="h-full rounded-[2px] bg-white/25" />
        </BaseSlider.Track>
        <BaseSlider.Thumb className="relative h-3 w-4 cursor-inherit overflow-visible transition-[transform,outline-offset] duration-120 ease-[var(--ease-out-cubic)] focus-visible:outline-none focus-visible:[&>span]:bg-white focus-visible:[&>span]:shadow-[var(--ds-shadow-knob),0_0_0_3px_rgb(255_255_255_/_0.16)] active:scale-[0.96] data-[dragging]:scale-[0.96] data-[disabled]:opacity-45">
          <span
            className="block h-full w-full rounded-[var(--ds-radius-thumb)] border-2 border-white/15 bg-white/85 shadow-[var(--ds-shadow-knob)] transition-[background-color,box-shadow,transform] duration-[160ms,160ms,260ms] ease-[var(--ease-out-cubic),var(--ease-out-cubic),cubic-bezier(0.34,1.56,0.64,1)] will-change-transform hover:bg-white/92"
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
