"use client"

import type { ReactNode } from "react"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"

export function EmptyState({
  action,
  className,
  description,
  glyph,
  hint,
  title,
}: {
  action?: ReactNode
  className?: string
  description: string
  glyph: ReactNode
  hint?: ReactNode
  title: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[380px] flex-col items-center justify-center gap-[var(--ds-space-3)] px-6 py-10 text-center",
        className
      )}
    >
      <span className="text-[var(--ds-color-text-disabled)]">{glyph}</span>

      <div className="flex max-w-[380px] flex-col gap-[var(--ds-space-1)]">
        <Typography align="center" as="p" variant="label">
          {title}
        </Typography>
        <Typography align="center" as="p" tone="tertiary" variant="caption">
          {description}
        </Typography>
      </div>

      {action}
      {hint}
    </div>
  )
}
