import type { Route } from "next"
import Link from "next/link"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import { profilePagePath } from "@/lib/community/scene-links"
import { cn } from "@/lib/cn"

export function AuthorLink({
  avatarSize = 20,
  avatarUrl,
  className,
  handle,
  name,
  newTab = false,
}: {
  avatarSize?: number
  avatarUrl: string | null
  className?: string
  handle: string
  name: string | null
  newTab?: boolean
}) {
  const label = name ?? `@${handle}`

  return (
    <Link
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2",
        className
      )}
      href={profilePagePath(handle) as Route}
      {...(newTab ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      <AuthorAvatar avatarUrl={avatarUrl} name={label} size={avatarSize} />
      <Typography
        as="span"
        className="overflow-hidden text-ellipsis whitespace-nowrap"
        tone="secondary"
        variant="caption"
      >
        {label}
      </Typography>
    </Link>
  )
}
