"use client"

import { Select as BaseSelect } from "@base-ui/react/select"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

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
  triggerVariant?: "default" | "icon"
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
  triggerVariant = "default",
  valueClassName,
  ...props
}: SelectProps) {
  const isIconTrigger = triggerVariant === "icon"

  return (
    <BaseSelect.Root
      items={options.map(({ label: itemLabel, value }) => ({
        label: itemLabel,
        value,
      }))}
      modal={false}
      {...props}
    >
      <div className={cn("flex w-fit flex-col gap-1", className)}>
        {label ? (
          <BaseSelect.Label className="font-[var(--ds-font-sans)] text-[10px] leading-3 text-[var(--ds-color-text-muted)]">
            {label}
          </BaseSelect.Label>
        ) : null}

        <BaseSelect.Trigger
          aria-label={triggerAriaLabel}
          data-ds-value={isIconTrigger ? undefined : ""}
          className={cn(
            isIconTrigger
              ? "group inline-flex h-7 w-7 min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border-0 bg-transparent p-0 text-[var(--ds-color-text-tertiary)] transition-[background-color,box-shadow,color,transform] duration-160 ease-[var(--ease-out-cubic)] will-change-transform hover:not-data-disabled:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] active:not-data-disabled:scale-[0.96] data-[popup-open]:bg-white/12 data-[popup-open]:text-white/70 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 focus-visible:shadow-[inset_0_0_0_1px_var(--ds-border-active)]"
              : "group inline-flex min-h-8 w-fit min-w-0 cursor-pointer items-center justify-between gap-[10px] rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] py-[6px] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out-cubic)] hover:not-data-disabled:bg-white/8 hover:not-data-disabled:border-[var(--ds-border-hover)] active:not-data-disabled:scale-[0.98] data-[popup-open]:bg-white/8 data-[popup-open]:border-[var(--ds-border-hover)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 focus-visible:border-[var(--ds-border-active)] focus-visible:shadow-[inset_0_0_0_1px_var(--ds-border-active)]",
            triggerClassName
          )}
        >
          <BaseSelect.Value
            className={cn(
              isIconTrigger
                ? "inline-flex items-center justify-center leading-none text-inherit"
                : "min-w-0 flex-1 truncate text-left text-[11px] leading-[14px] text-inherit data-[placeholder]:text-[var(--ds-color-text-secondary)]",
              valueClassName
            )}
            placeholder={placeholder}
          />
          <BaseSelect.Icon
            className={cn(
              isIconTrigger
                ? "hidden"
                : "inline-flex shrink-0 text-[var(--ds-color-text-tertiary)] transition-[color,transform] duration-160 ease-[var(--ease-out-cubic)] group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-[var(--ds-color-text-secondary)] [&_svg]:h-[10px] [&_svg]:w-[10px]",
              iconClassName
            )}
          >
            <ChevronIcon />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          className="z-50 outline-none"
          sideOffset={8}
        >
          <BaseSelect.Popup
            className={cn(
              "min-w-[var(--anchor-width)] overflow-hidden rounded-[var(--ds-radius-control)] border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.72)] shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[24px]",
              popupClassName
            )}
          >
            <BaseSelect.List className="flex flex-col gap-0.5 p-1">
              {options.map((option) => (
                <BaseSelect.Item
                  className="cursor-pointer rounded-[var(--ds-radius-icon)] px-[10px] py-[6px] text-[var(--ds-color-text-secondary)] outline-none transition-[background-color,color] duration-140 ease-[var(--ease-out-cubic)] data-[highlighted]:bg-[var(--ds-color-surface-active)] data-[selected]:bg-[var(--ds-color-surface-active)] data-[highlighted]:text-[var(--ds-color-text-primary)] data-[selected]:text-[var(--ds-color-text-primary)] data-[disabled]:cursor-not-allowed data-[disabled]:text-[var(--ds-color-text-disabled)]"
                  disabled={option.disabled}
                  key={option.value}
                  value={option.value}
                >
                  <BaseSelect.ItemText
                    className="block text-[11px] leading-[14px]"
                    data-ds-value=""
                  >
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
