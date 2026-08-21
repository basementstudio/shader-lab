import type { ReactNode } from "react"
import { Typography } from "@/components/ui/typography"

export function SceneTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] px-2">
      <Typography as="span" variant="monoXs">
        {children}
      </Typography>
    </span>
  )
}
