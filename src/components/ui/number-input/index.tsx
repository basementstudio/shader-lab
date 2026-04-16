"use client"

import { type InputHTMLAttributes, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/cn"
import { formatNumberForDisplay } from "@/lib/format-number"

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value"
> & {
  formatValue?: ((value: number) => string) | undefined
  onChange: (value: number) => void
  parseValue?: ((value: string) => number | null) | undefined
  value: number
}

function defaultParseValue(value: string): number | null {
  const normalized = value.trim().replaceAll(",", ".")

  if (normalized.length === 0) {
    return null
  }

  const nextValue = Number.parseFloat(normalized)
  return Number.isFinite(nextValue) ? nextValue : null
}

export function NumberInput({
  className,
  formatValue,
  inputMode = "decimal",
  max,
  min,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  parseValue = defaultParseValue,
  step,
  value,
  ...props
}: NumberInputProps) {
  const [draftValue, setDraftValue] = useState(() =>
    formatValue ? formatValue(value) : formatNumberForDisplay(value)
  )
  const isEditingRef = useRef(false)

  useEffect(() => {
    if (isEditingRef.current) {
      return
    }

    setDraftValue(
      formatValue ? formatValue(value) : formatNumberForDisplay(value)
    )
  }, [formatValue, value])

  const commitDraftValue = () => {
    const parsedValue = parseValue(draftValue)

    if (parsedValue === null) {
      setDraftValue(
        formatValue ? formatValue(value) : formatNumberForDisplay(value)
      )
      return
    }

    const clampedValue = Math.min(
      typeof max === "number" ? max : parsedValue,
      Math.max(typeof min === "number" ? min : parsedValue, parsedValue)
    )

    onChange(clampedValue)
    setDraftValue(
      formatValue
        ? formatValue(clampedValue)
        : formatNumberForDisplay(clampedValue)
    )
  }

  return (
    <input
      {...props}
      className={cn(className)}
      inputMode={inputMode}
      max={max}
      min={min}
      onBlur={(event) => {
        isEditingRef.current = false
        commitDraftValue()
        onBlur?.(event)
      }}
      onChange={(event) => {
        setDraftValue(event.currentTarget.value)
      }}
      onFocus={(event) => {
        isEditingRef.current = true
        event.currentTarget.select()
        onFocus?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commitDraftValue()
          event.currentTarget.blur()
          return
        }

        if (event.key === "Escape") {
          isEditingRef.current = false
          setDraftValue(
            formatValue ? formatValue(value) : formatNumberForDisplay(value)
          )
          event.currentTarget.blur()
          return
        }

        onKeyDown?.(event)
      }}
      step={step}
      type="text"
      value={draftValue}
    />
  )
}
