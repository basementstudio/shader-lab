"use client"

import Image from "next/image"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

function CaretUpGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={10}
      viewBox="0 0 16 16"
      width={10}
    >
      <path
        d="M8 3.5 13.5 11h-11L8 3.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={1.2}
      />
    </svg>
  )
}

function RemixGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={11}
      viewBox="0 0 16 16"
      width={11}
    >
      <path
        d="M2 4h3.2c1 0 1.6.5 2.2 1.4l2.6 4.2c.6.9 1.2 1.4 2.2 1.4H14M2 12h3.2c1 0 1.6-.5 2.2-1.4l.9-1.4M11 2.6 14 4l-3 1.4M11 9.6 14 11l-3 1.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
    </svg>
  )
}

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
              <CaretUpGlyph />
            </span>
            <Typography as="span" tone="secondary" variant="monoXs">
              {scene.likeCount}
            </Typography>
          </span>

          <span aria-hidden="true" className="h-2.5 w-px bg-white/12" />

          <span className="inline-flex items-center gap-1">
            <span className="text-[var(--ds-color-text-secondary)]">
              <RemixGlyph />
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
