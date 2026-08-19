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
  description?: string
  glyph: ReactNode
  hint?: ReactNode
  title: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[460px] flex-col items-center justify-center gap-[var(--ds-space-5)] px-6 py-16 text-center",
        className
      )}
    >
      <span className="text-[var(--ds-color-text-tertiary)] [&_svg]:size-10">
        {glyph}
      </span>

      <div className="flex max-w-[440px] flex-col gap-[var(--ds-space-2)]">
        <Typography align="center" as="p" variant="heading">
          {title}
        </Typography>
        {description ? (
          <Typography align="center" as="p" tone="tertiary" variant="body">
            {description}
          </Typography>
        ) : null}
      </div>

      {action || hint ? (
        <div className="flex flex-col items-center gap-[var(--ds-space-4)]">
          {action}
          {hint}
        </div>
      ) : null}
    </div>
  )
}
