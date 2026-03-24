import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"

const glassPanelVariants = cva(
  "border border-[var(--ds-border-panel)] text-[var(--ds-color-text-primary)] backdrop-blur-[24px] transition-[border-color,background-color,box-shadow] duration-160 ease-[var(--ease-out-cubic)]",
  {
  variants: {
    variant: {
      panel:
        "overflow-clip rounded-[var(--ds-radius-panel)] bg-[var(--ds-color-glass-panel)] shadow-[var(--ds-shadow-panel-dark)]",
      pill:
        "inline-flex min-h-9 items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-bar)] bg-[var(--ds-color-glass-pill)] px-[var(--ds-space-3)] shadow-[var(--ds-shadow-pill-dark)]",
    },
    interactive: {
      true: "hover:border-[var(--ds-border-hover)]",
    },
  },
  defaultVariants: {
    variant: "panel",
  },
})

interface GlassPanelProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassPanelVariants> {
  children?: ReactNode
}

export function GlassPanel({
  children,
  className,
  interactive,
  variant,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(glassPanelVariants({ variant, interactive }), className)}
      {...props}
    >
      {children}
    </div>
  )
}
