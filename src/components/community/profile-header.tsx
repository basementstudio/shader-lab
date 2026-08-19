import type { ReactNode } from "react"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import type { PublicProfileView } from "@/lib/community/profiles"

function joinedLabel(joinedAt: string): string | null {
  const date = new Date(joinedAt)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

type ProfileHeaderScale = "page" | "panel"

const SCALES = {
  page: {
    avatar: 96,
    gap: "var(--ds-space-5)",
    meta: "monoMd",
    name: "display",
    statLabel: "body",
    statValue: "heading",
  },
  panel: {
    avatar: 56,
    gap: "var(--ds-space-4)",
    meta: "monoSm",
    name: "heading",
    statLabel: "caption",
    statValue: "label",
  },
} as const

export function ProfileHeader({
  action,
  avatarSize,
  profile,
  scale = "panel",
}: {
  action?: ReactNode
  avatarSize?: number
  profile: PublicProfileView
  scale?: ProfileHeaderScale
}) {
  const label = profile.displayName ?? `@${profile.handle}`
  const joined = joinedLabel(profile.joinedAt)
  const step = SCALES[scale]

  return (
    <header className="flex flex-col" style={{ gap: step.gap }}>
      <div className="flex items-center justify-between gap-[var(--ds-space-4)]">
        <div className="flex min-w-0 items-center gap-[var(--ds-space-4)]">
          <AuthorAvatar
            avatarUrl={profile.avatarUrl}
            name={label}
            size={avatarSize ?? step.avatar}
          />

          <div className="flex min-w-0 flex-col gap-[var(--ds-space-1)]">
            <Typography as="h1" className="text-balance" variant={step.name}>
              {label}
            </Typography>
            <Typography as="span" tone="secondary" variant={step.meta}>
              @{profile.handle}
              {joined ? ` · publishing since ${joined}` : ""}
            </Typography>
          </div>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <dl className="flex flex-wrap gap-[var(--ds-space-5)]">
        <ProfileStat
          label={profile.publishedCount === 1 ? "scene" : "scenes"}
          scale={scale}
          value={profile.publishedCount}
        />
        <ProfileStat
          label={profile.upvoteCount === 1 ? "upvote" : "upvotes"}
          scale={scale}
          value={profile.upvoteCount}
        />
        <ProfileStat
          label={profile.remixCount === 1 ? "remix" : "remixes"}
          scale={scale}
          value={profile.remixCount}
        />
      </dl>
    </header>
  )
}

function ProfileStat({
  label,
  scale,
  value,
}: {
  label: string
  scale: ProfileHeaderScale
  value: number
}) {
  const step = SCALES[scale]

  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <Typography
          as="span"
          className="tabular-nums"
          variant={step.statValue}
        >
          {value}
        </Typography>
        <Typography as="span" tone="secondary" variant={step.statLabel}>
          {label}
        </Typography>
      </dd>
    </div>
  )
}
