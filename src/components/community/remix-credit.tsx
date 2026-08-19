"use client"

import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import { isSelfRemix, lineageAuthorName } from "@/lib/community/lineage"
import type { SceneLineage } from "@/lib/community/scenes"

export function RemixCredit({
  lineage,
  sceneAuthorHandle,
}: {
  lineage: SceneLineage
  sceneAuthorHandle: string
}) {
  const name = lineageAuthorName(lineage)
  const showAuthor = !isSelfRemix(sceneAuthorHandle, lineage)

  return (
    <span className="inline-flex min-w-0 items-center gap-[var(--ds-space-2)]">
      <Typography as="span" tone="secondary" variant="caption">
        Remixed from
      </Typography>
      {showAuthor ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <AuthorAvatar
            avatarUrl={lineage.authorAvatarUrl}
            name={name}
            size={20}
          />
          <Typography
            as="span"
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            tone="secondary"
            variant="caption"
          >
            {name}
          </Typography>
        </span>
      ) : (
        <Typography
          as="span"
          className="overflow-hidden text-ellipsis whitespace-nowrap"
          variant="caption"
        >
          {lineage.title}
        </Typography>
      )}
    </span>
  )
}
