"use client"

import { HeartIcon, ShuffleIcon } from "@radix-ui/react-icons"
import Image from "next/image"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

export function SceneCard({
  onSelect,
  scene,
}: {
  onSelect: (scene: CommunitySceneSummary) => void
  scene: CommunitySceneSummary
}) {
  return (
    <button
      className="group flex w-full cursor-pointer flex-col gap-[var(--ds-space-2)] rounded-[10px] text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
      onClick={() => onSelect(scene)}
      type="button"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
        {scene.thumbnailUrl ? (
          <Image
            alt={scene.title}
            className="object-cover"
            fill
            sizes="(max-width: 900px) 45vw, 260px"
            src={scene.thumbnailUrl}
          />
        ) : null}

        <div className="pointer-events-none absolute top-1.5 right-1.5 inline-flex items-center gap-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
          <span className="inline-flex items-center gap-1">
            <span className="text-[var(--ds-color-text-secondary)]">
              <HeartIcon height={11} width={11} />
            </span>
            <Typography as="span" tone="secondary" variant="monoXs">
              {scene.likeCount}
            </Typography>
          </span>

          <span aria-hidden="true" className="h-2.5 w-px bg-[var(--ds-border-divider)]" />

          <span className="inline-flex items-center gap-1">
            <span className="text-[var(--ds-color-text-secondary)]">
              <ShuffleIcon height={11} width={11} />
            </span>
            <Typography as="span" tone="secondary" variant="monoXs">
              {scene.remixCount}
            </Typography>
          </span>
        </div>
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
    </button>
  )
}
