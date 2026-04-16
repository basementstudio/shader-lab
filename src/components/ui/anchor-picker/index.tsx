"use client"

import { cn } from "@/lib/cn"

type AnchorPickerOption = {
  label: string
  value: string
}

type AnchorPickerProps = {
  className?: string
  onValueChange: (value: string) => void
  options: readonly AnchorPickerOption[]
  value: string
}

const DOT_CLASSNAME =
  "pointer-events-none inline-flex h-2.5 w-2.5 rounded-full border border-white/30 bg-white/18 transition-[transform,background-color,border-color,box-shadow] duration-150 ease-[var(--ease-out-cubic)]"

export function AnchorPicker({
  className,
  onValueChange,
  options,
  value,
}: AnchorPickerProps) {
  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((option) => {
          const isSelected = option.value === value

          return (
            <button
              aria-label={option.label}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-border-active)] active:scale-[0.98]",
                isSelected &&
                  "border-[var(--ds-border-active)] bg-white/10 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.06)]"
              )}
              key={option.value}
              onClick={() => onValueChange(option.value)}
              type="button"
            >
              <span
                className={cn(
                  DOT_CLASSNAME,
                  isSelected &&
                    "scale-110 border-white/55 bg-white shadow-[0_0_0_4px_rgb(255_255_255_/_0.08)]"
                )}
              />
            </button>
          )
        })}
      </div>

      <span className="font-[var(--ds-font-mono)] text-[10px] leading-3 text-[var(--ds-color-text-muted)]">
        {selectedOption?.label ?? "Center"}
      </span>
    </div>
  )
}
