"use client"

import { Popover } from "@base-ui/react/popover"
import { DotsHorizontalIcon } from "@radix-ui/react-icons"
import type { ReactNode } from "react"
import { GlassPanel } from "@/components/ui/glass-panel"
import { iconButtonVariants } from "@/components/ui/icon-button/variants"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"

export function Menu({
  align = "end",
  children,
  className,
  disabled,
  label,
  side = "bottom",
  triggerClassName,
  triggerVariant = "default",
}: {
  align?: "center" | "start" | "end"
  children: ReactNode
  className?: string
  disabled?: boolean
  label: string
  side?: "top" | "right" | "bottom" | "left"
  triggerClassName?: string
  triggerVariant?: "default" | "ghost" | "outline" | "overlay"
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className={cn(
          iconButtonVariants({ variant: triggerVariant }),
          triggerClassName
        )}
        disabled={disabled}
      >
        <DotsHorizontalIcon height={14} width={14} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          align={align}
          className="z-100"
          side={side}
          sideOffset={6}
        >
          <Popover.Popup className="outline-none">
            <GlassPanel
              className={cn(
                "flex w-[168px] flex-col p-[var(--ds-space-1)]",
                className
              )}
              variant="panel"
            >
              {children}
            </GlassPanel>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Popover.Close
      className="inline-flex min-h-8 w-full cursor-pointer items-center rounded-[var(--ds-radius-icon)] border-0 bg-transparent px-[var(--ds-space-2)] text-left text-[var(--ds-color-text-secondary)] transition-[background-color,color] duration-160 ease-[var(--ease-out-cubic)] disabled:cursor-not-allowed disabled:text-[var(--ds-color-text-disabled)] hover:not-disabled:bg-[var(--ds-color-surface-active)] hover:not-disabled:text-[var(--ds-color-text-primary)]"
      disabled={disabled}
      onClick={onClick}
    >
      <Typography as="span" tone="inherit" variant="body">
        {children}
      </Typography>
    </Popover.Close>
  )
}

export function MenuSeparator() {
  return (
    <span
      aria-hidden="true"
      className="my-[var(--ds-space-1)] block h-px w-full bg-[var(--ds-border-divider)]"
    />
  )
}
