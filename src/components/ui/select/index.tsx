"use client"

import { Select as BaseSelect } from "@base-ui/react/select"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import s from "./select.module.css"

export interface SelectOption {
  disabled?: boolean
  label: ReactNode
  value: string
}

type SelectProps = Omit<
  BaseSelect.Root.Props<string>,
  "children" | "className" | "items"
> & {
  className?: string
  iconClassName?: string
  label?: ReactNode
  options: readonly SelectOption[]
  placeholder?: ReactNode
  popupClassName?: string
  triggerAriaLabel?: string
  triggerClassName?: string
  valueClassName?: string
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 10 10">
      <path
        d="M3 4L5 6L7 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  )
}

export function Select({
  className,
  iconClassName,
  label,
  options,
  placeholder = "Select",
  popupClassName,
  triggerAriaLabel,
  triggerClassName,
  valueClassName,
  ...props
}: SelectProps) {
  return (
    <BaseSelect.Root
      items={options.map(({ label: itemLabel, value }) => ({
        label: itemLabel,
        value,
      }))}
      modal={false}
      {...props}
    >
      <div className={cn(s.root, className)}>
        {label ? <BaseSelect.Label className={s.label}>{label}</BaseSelect.Label> : null}

        <BaseSelect.Trigger
          aria-label={triggerAriaLabel}
          className={cn(s.trigger, triggerClassName)}
        >
          <BaseSelect.Value
            className={cn(s.value, valueClassName)}
            placeholder={placeholder}
          />
          <BaseSelect.Icon className={cn(s.icon, iconClassName)}>
            <ChevronIcon />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          className={s.positioner}
          sideOffset={8}
        >
          <BaseSelect.Popup className={cn(s.popup, popupClassName)}>
            <BaseSelect.List className={s.list}>
              {options.map((option) => (
                <BaseSelect.Item
                  className={s.item}
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  <BaseSelect.ItemText className={s.itemText}>
                    {option.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
