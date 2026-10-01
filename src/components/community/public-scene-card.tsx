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
    <div className="group flex min-w-0 flex-col gap-[var(--ds-space-2)] rounded-toolbar bg-[var(--ds-color-card)] p-bar pb-[var(--ds-space-3)] shadow-[var(--skin-card-shadow)] transition-[box-shadow,translate] duration-200 ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-panel-dark)]">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-icon bg-[var(--ds-color-media)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ds-color-accent)] has-[:focus-visible]:outline-offset-2">
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

        <div className="ds-on-media pointer-events-none absolute right-[var(--ds-space-2)] bottom-[var(--ds-space-2)] z-[2] opacity-0 transition-opacity duration-160 ease-[var(--ease-out-cubic)] group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButtonLink
            aria-label={`Remix ${scene.title}`}
            className="pointer-events-auto border border-[var(--ds-border-divider)] bg-[var(--ds-color-media-glass)] backdrop-blur-[8px]"
            href={editorSceneHref(scene.slug) as Route}
          >
            <ShuffleIcon height={13} width={13} />
          </IconButtonLink>
        </div>
      </div>

      <Link
        className="min-w-0 rounded-[var(--ds-radius-control)] px-[var(--ds-space-1)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
        href={scenePagePath(scene.slug) as Route}
      >
        <Typography
          as="span"
          className="block overflow-hidden text-ellipsis whitespace-nowrap font-medium"
          variant="label"
        >
          {scene.title}
        </Typography>
      </Link>

      {showAuthor ? (
        <AuthorLink
          avatarUrl={scene.authorAvatarUrl}
          className="px-[var(--ds-space-1)]"
          handle={scene.authorHandle}
          name={scene.authorName}
        />
      ) : null}
    </div>
  )
}
