"use client"

import Image from "next/image"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"

export function AuthorAvatar({
  avatarUrl,
  className,
  name,
  size = 20,
}: {
  avatarUrl: string | null
  className?: string
  name: string
  size?: number
}) {
  const shell = cn(
    "shrink-0 rounded-full border border-[var(--ds-border-subtle)]",
    className
  )

  if (avatarUrl) {
    return (
      <Image
        alt=""
        className={cn(shell, "object-cover")}
        height={size}
        src={avatarUrl}
        style={{ height: size, width: size }}
        width={size}
      />
    )
  }

  return (
    <span
      className={cn(
        shell,
        "flex items-center justify-center bg-[var(--ds-color-surface-control)]"
      )}
      style={{ height: size, width: size }}
    >
      <Typography as="span" tone="secondary" variant="monoXs">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Typography>
    </span>
  )
}
