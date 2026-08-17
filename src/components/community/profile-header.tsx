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

export function ProfileHeader({
  avatarSize = 56,
  profile,
}: {
  avatarSize?: number
  profile: PublicProfileView
}) {
  const label = profile.displayName ?? `@${profile.handle}`
  const joined = joinedLabel(profile.joinedAt)

  return (
    <header className="flex flex-col gap-[var(--ds-space-4)]">
      <div className="flex min-w-0 items-center gap-[var(--ds-space-3)]">
        <AuthorAvatar
          avatarUrl={profile.avatarUrl}
          name={label}
          size={avatarSize}
        />

        <div className="flex min-w-0 flex-col gap-[2px]">
          <Typography as="h1" variant="heading">
            {label}
          </Typography>
          <Typography as="span" tone="tertiary" variant="monoXs">
            @{profile.handle}
            {joined ? ` · publishing since ${joined}` : ""}
          </Typography>
        </div>
      </div>

      <dl className="flex flex-wrap gap-[var(--ds-space-4)]">
        <ProfileStat
          label={profile.publishedCount === 1 ? "scene" : "scenes"}
          value={profile.publishedCount}
        />
        <ProfileStat
          label={profile.upvoteCount === 1 ? "upvote" : "upvotes"}
          value={profile.upvoteCount}
        />
        <ProfileStat
          label={profile.remixCount === 1 ? "remix" : "remixes"}
          value={profile.remixCount}
        />
      </dl>
    </header>
  )
}

function ProfileStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <Typography as="span" className="tabular-nums" variant="label">
          {value}
        </Typography>
        <Typography as="span" tone="tertiary" variant="caption">
          {label}
        </Typography>
      </dd>
    </div>
  )
}
