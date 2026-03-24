"use client"

import { Switch as BaseSwitch } from "@base-ui/react/switch"
import { type ReactNode, useId } from "react"
import { cn } from "@/lib/cn"
import s from "./toggle.module.css"

type ToggleProps = Omit<BaseSwitch.Root.Props, "children" | "className"> & {
  className?: string
  label?: ReactNode
}

export function Toggle({ className, label, ...props }: ToggleProps) {
  const labelId = useId()

  return (
    <div className={cn(s.wrapper, className)}>
      <BaseSwitch.Root
        aria-labelledby={label ? labelId : undefined}
        className={s.root}
        {...props}
      >
        <BaseSwitch.Thumb className={s.thumb} />
      </BaseSwitch.Root>
      {label ? (
        <span className={s.label} id={labelId}>
          {label}
        </span>
      ) : null}
    </div>
  )
}
