import type { CSSProperties } from "react"
import { cn } from "@/lib/cn"

const COMPACT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

export function StatNumber({
  className,
  share,
  value,
}: {
  className?: string
  share?: string
  value: number
}) {
  const text = COMPACT.format(value)

  return (
    <span
      aria-hidden="true"
      className={cn("ds-stat-number", className)}
      style={
        {
          "--digits": text.length,
          ...(share ? { "--ds-stat-share": share } : {}),
        } as CSSProperties
      }
    >
      {text}
    </span>
  )
}
