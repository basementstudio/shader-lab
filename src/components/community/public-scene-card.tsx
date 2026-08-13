import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

export function PublicSceneCard({
  priority = false,
  scene,
}: {
  priority?: boolean
  scene: CommunitySceneSummary
}) {
  return (
    <Link
      className="group flex flex-col gap-[var(--ds-space-2)] rounded-[10px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
      href={`/community/${scene.slug}` as Route}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
        {scene.thumbnailUrl ? (
          <Image
            alt={scene.title}
            className="object-cover"
            fill
            priority={priority}
            sizes="(min-width: 760px) 280px, 45vw"
            src={scene.thumbnailUrl}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-[5px] px-[2px]">
        <Typography
          as="span"
          className="overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-160 group-hover:text-white"
          variant="label"
        >
          {scene.title}
        </Typography>

        <span className="flex min-w-0 items-center gap-1.5">
          <AuthorAvatar
            avatarUrl={scene.authorAvatarUrl}
            name={scene.authorName ?? scene.authorHandle}
          />
          <Typography
            as="span"
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            tone="tertiary"
            variant="caption"
          >
            {scene.authorName ?? `@${scene.authorHandle}`}
          </Typography>
        </span>
      </div>
    </Link>
  )
}
