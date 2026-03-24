"use client"

import { Switch as BaseSwitch } from "@base-ui/react/switch"
import { type ReactNode, useId } from "react"
import { cn } from "@/lib/cn"

type ToggleProps = Omit<BaseSwitch.Root.Props, "children" | "className"> & {
  className?: string
  label?: ReactNode
}

export function Toggle({ className, label, ...props }: ToggleProps) {
  const labelId = useId()

  return (
    <div className={cn("inline-flex items-center gap-[10px] cursor-pointer", className)}>
      <BaseSwitch.Root
        aria-labelledby={label ? labelId : undefined}
        className="inline-flex h-5 w-[34px] shrink-0 items-center justify-start rounded-[var(--ds-radius-icon)] bg-white/10 p-[3px] transition-[background-color,transform] duration-160 ease-[var(--ease-out-cubic)] data-[checked]:bg-white/35 active:not-data-disabled:scale-[0.98] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-border-active)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
        {...props}
      >
        <BaseSwitch.Thumb className="h-3 w-4 rounded-[var(--ds-radius-thumb)] bg-white/50 shadow-[var(--ds-shadow-toggle-knob-off)] transition-[background-color,box-shadow,transform] duration-160 ease-[var(--ease-out-cubic)] data-[checked]:translate-x-3 data-[checked]:bg-white/95 data-[checked]:shadow-[var(--ds-shadow-toggle-knob-on)]" />
      </BaseSwitch.Root>
      {label ? (
        <span
          className="text-[11px] leading-[14px] text-[var(--ds-color-text-secondary)]"
          id={labelId}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}
