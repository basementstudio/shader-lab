"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/cn"
import { HoverTooltip } from "@/components/ui/tooltip"

export function InfoHint({
  children,
  className,
  focusable = false,
}: {
  children: ReactNode
  className?: string | undefined
  focusable?: boolean | undefined
}) {
  return (
    <HoverTooltip
      align="start"
      content={children}
      delay={450}
      side="top"
      sideOffset={6}
    >
      <span
        aria-label={typeof children === "string" ? children : "More info"}
        className={cn(
          "inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-color-text-secondary)] text-[var(--ds-color-text-muted)] transition-colors duration-120 ease-[ease] hover:text-[var(--ds-color-text-secondary)]",
          className
        )}
        data-info-hint="true"
        role="img"
        tabIndex={focusable ? 0 : undefined}
      >
        <svg aria-hidden="true" fill="none" height="11" viewBox="0 0 12 12" width="11">
          <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1" />
          <path d="M6 5.25V8.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
          <circle cx="6" cy="3.55" fill="currentColor" r="0.7" />
        </svg>
      </span>
    </HoverTooltip>
  )
}
