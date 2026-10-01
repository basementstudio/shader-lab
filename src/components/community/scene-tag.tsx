import type { ReactNode } from "react"
import { Typography } from "@/components/ui/typography"

export function SceneTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[var(--ds-size-icon-button)] items-center rounded-[var(--ds-radius-pill)] bg-[var(--ds-color-surface-control)] px-[var(--ds-space-3)] text-[var(--ds-color-text-secondary)] transition-colors duration-160 ease-[var(--ease-out-cubic)] hover:bg-[var(--ds-color-surface-active)] hover:text-[var(--ds-color-text-primary)]">
      <Typography as="span" tone="inherit" variant="label">
        {children}
      </Typography>
    </span>
  )
}
