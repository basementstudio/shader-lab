"use client"

import { HeartIcon, ShuffleIcon } from "@radix-ui/react-icons"
import type { Route } from "next"
import Image from "next/image"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { scenePagePath } from "@/lib/community/scene-links"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

const CARD_CTA_CLASSES =
  "pointer-events-none border border-white/10 bg-[rgb(8_9_12_/_0.68)] backdrop-blur-[8px] group-hover:pointer-events-auto group-focus-within:pointer-events-auto"

export function SceneCard({
  featured = false,
  onRemix,
  onSelect,
  scene,
}: {
  featured?: boolean
  onRemix?: ((scene: CommunitySceneSummary) => void) | undefined
  onSelect: (scene: CommunitySceneSummary) => void
  scene: CommunitySceneSummary
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-[var(--ds-space-2)] rounded-[10px] text-left",
        featured && "col-span-2 row-span-2 h-full"
      )}
    >
      {/* Hover, click and focus all live on the thumbnail; the title and
          author row below stays inert. */}
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-[var(--ds-border-active)] has-[:focus-visible]:outline-offset-2",
          featured ? "min-h-0 flex-1" : "aspect-[16/10]"
        )}
      >
        {scene.thumbnailUrl ? (
          <Image
            alt={scene.title}
            className="object-cover"
            fill
            sizes={
              featured
                ? "(max-width: 900px) 92vw, 540px"
                : "(max-width: 900px) 45vw, 260px"
            }
            src={scene.thumbnailUrl}
          />
        ) : null}

        <button
          aria-label={`View ${scene.title}`}
          className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-none"
          onClick={() => onSelect(scene)}
          type="button"
        />

        <div className="pointer-events-none absolute top-1.5 right-1.5 z-[2] inline-flex items-center gap-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
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

        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center gap-2 opacity-0 transition-opacity duration-160 ease-[var(--ease-out-cubic)] group-focus-within:opacity-100 group-hover:opacity-100">
          <ButtonLink
            className={CARD_CTA_CLASSES}
            href={scenePagePath(scene.slug) as Route}
            rel="noreferrer"
            size="compact"
            target="_blank"
            variant="secondary"
          >
            Open scene
          </ButtonLink>
          {onRemix ? (
            <Button
              className={CARD_CTA_CLASSES}
              onClick={() => onRemix(scene)}
              size="compact"
              uiSound="action.addLayer"
              variant="secondary"
            >
              Remix
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[5px] px-[2px]">
        <Typography
          as="span"
          className="overflow-hidden text-ellipsis whitespace-nowrap"
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
    </div>
  )
}
