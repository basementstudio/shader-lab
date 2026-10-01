import type { ReactNode } from "react"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { StatNumber } from "@/components/community/stat-number"
import { Typography } from "@/components/ui/typography"
import { pluralize } from "@/lib/plural"
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
    meta: "body",
    name: "display",
    statLabel: "body",
    statValue: "heading",
  },
  panel: {
    avatar: 56,
    gap: "var(--ds-space-4)",
    meta: "caption",
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

  if (scale === "page") {
    return (
      <ProfileBanner
        action={action}
        avatarSize={avatarSize ?? step.avatar}
        joined={joined}
        label={label}
        profile={profile}
      />
    )
  }

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

      <dl className="flex flex-wrap gap-[var(--ds-space-2)]">
        <ProfileStat
          count={profile.publishedCount}
          noun="scene"
          scale={scale}
        />
        <ProfileStat count={profile.upvoteCount} noun="like" scale={scale} />
        <ProfileStat count={profile.remixCount} noun="remix" scale={scale} />
      </dl>
    </header>
  )
}

function ProfileStat({
  count,
  noun,
  scale,
}: {
  count: number
  noun: string
  scale: ProfileHeaderScale
}) {
  const step = SCALES[scale]
  const label = pluralize(count, noun)

  return (
    <div className="flex min-w-[96px] flex-col rounded-[var(--ds-radius-control)] bg-[var(--ds-color-surface-control)] px-[var(--ds-space-3)] py-[var(--ds-space-2)] shadow-[var(--ds-shadow-recessed)]">
      <dt className="sr-only">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <Typography as="span" className="tabular-nums" variant={step.statValue}>
          {count}
        </Typography>
        <Typography as="span" tone="secondary" variant={step.statLabel}>
          {label}
        </Typography>
      </dd>
    </div>
  )
}

function ProfileBanner({
  action,
  avatarSize,
  joined,
  label,
  profile,
}: {
  action?: ReactNode
  avatarSize: number
  joined: string | null
  label: string
  profile: PublicProfileView
}) {
  return (
    <header className="grid grid-cols-3 gap-bar rounded-[var(--ds-radius-banner)] bg-[var(--ds-color-card)] p-bar shadow-[var(--skin-card-shadow)] min-[1000px]:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
      <div className="col-span-3 flex min-h-[var(--ds-size-stat-tile)] min-w-0 flex-col justify-between gap-[var(--ds-space-5)] p-[var(--ds-space-4)] min-[1000px]:col-span-1">
        <div className="flex items-start justify-between gap-[var(--ds-space-3)]">
          <AuthorAvatar
            avatarUrl={profile.avatarUrl}
            name={label}
            size={avatarSize}
          />
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-[var(--ds-space-1)]">
          <Typography
            as="h1"
            className="break-words text-balance [overflow-wrap:anywhere]"
            variant="heading"
          >
            {label}
          </Typography>
          <Typography as="span" tone="secondary" variant="body">
            @{profile.handle}
            {joined ? ` · publishing since ${joined}` : ""}
          </Typography>
        </div>
      </div>

      <dl className="contents">
        <StatTile count={profile.publishedCount} noun="scene" />
        <StatTile count={profile.upvoteCount} noun="like" />
        <StatTile count={profile.remixCount} noun="remix" />
      </dl>
    </header>
  )
}

function StatTile({ count, noun }: { count: number; noun: string }) {
  const label = pluralize(count, noun)

  return (
    <div className="ds-stat min-h-[var(--ds-size-stat-tile-compact)] rounded-[var(--ds-radius-card)] min-[1000px]:min-h-[var(--ds-size-stat-tile)] bg-[var(--ds-color-surface-control)] p-[var(--ds-space-4)]">
      <dt className="relative z-[1]">
        <Typography as="span" className="capitalize" variant="title">
          {label}
        </Typography>
      </dt>
      <dd className="m-0">
        <span className="sr-only">{count}</span>
        <StatNumber value={count} />
      </dd>
    </div>
  )
}
