import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { AuthorLink } from "@/components/community/author-link"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

export function PublicSceneCard({
  priority = false,
  scene,
  showAuthor = true,
}: {
  priority?: boolean
  scene: CommunitySceneSummary
  showAuthor?: boolean
}) {
  return (
    <div className="group flex min-w-0 flex-col gap-[5px]">
      <Link
        className="flex min-w-0 flex-col gap-[var(--ds-space-2)] rounded-[10px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
        href={`/community/${scene.slug}` as Route}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
          {scene.thumbnailUrl ? (
            <Image
              alt={scene.title}
              className="object-cover"
              fill
              priority={priority}
              sizes="(min-width: 1000px) 380px, (min-width: 640px) 50vw, 100vw"
              src={scene.thumbnailUrl}
            />
          ) : null}
        </div>

        <Typography
          as="span"
          className="overflow-hidden text-ellipsis whitespace-nowrap px-[2px] transition-colors duration-160 group-hover:text-white"
          variant="label"
        >
          {scene.title}
        </Typography>
      </Link>

      {showAuthor ? (
        <AuthorLink
          avatarUrl={scene.authorAvatarUrl}
          className="px-[2px]"
          handle={scene.authorHandle}
          name={scene.authorName}
        />
      ) : null}
    </div>
  )
}
