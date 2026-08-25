import { ShuffleIcon } from "@radix-ui/react-icons"
import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { AuthorLink } from "@/components/community/author-link"
import { IconButtonLink } from "@/components/ui/icon-button/link"
import { Typography } from "@/components/ui/typography"
import { editorSceneHref, scenePagePath } from "@/lib/community/scene-links"
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
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-[var(--ds-border-active)] has-[:focus-visible]:outline-offset-2">
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

        <Link
          aria-label={`View ${scene.title}`}
          className="absolute inset-0 z-[1] focus-visible:outline-none"
          href={scenePagePath(scene.slug) as Route}
        />

        <div className="pointer-events-none absolute right-1.5 bottom-1.5 z-[2] opacity-0 transition-opacity duration-160 ease-[var(--ease-out-cubic)] group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButtonLink
            aria-label={`Remix ${scene.title}`}
            className="pointer-events-auto border border-white/10 bg-[rgb(8_9_12_/_0.68)] backdrop-blur-[8px]"
            href={editorSceneHref(scene.slug) as Route}
          >
            <ShuffleIcon height={13} width={13} />
          </IconButtonLink>
        </div>
      </div>

      <Link
        className="min-w-0 rounded-[var(--ds-radius-control)] px-[2px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
        href={scenePagePath(scene.slug) as Route}
      >
        <Typography
          as="span"
          className="block overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-160 group-hover:text-white"
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
