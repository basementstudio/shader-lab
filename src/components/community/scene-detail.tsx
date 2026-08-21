"use client"

import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { DeleteSceneControl } from "@/components/community/delete-scene-control"
import { RemixCredit } from "@/components/community/remix-credit"
import { ReportControl } from "@/components/community/report-control"
import { ShareSceneButton } from "@/components/community/share-scene-button"
import { LikeButton } from "@/components/community/like-button"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import { lineageLabel } from "@/lib/community/lineage"
import { communityTagPath } from "@/lib/community/scene-links"
import { getSceneTagLabel, isCuratedSceneTag } from "@/lib/community/scene-tags"
import type {
  CommunitySceneDetail,
  CommunitySceneSummary,
} from "@/lib/community/scenes"
import { SceneTag } from "@/components/community/scene-tag"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"

function formatPublishedAt(value: string | null): string {
  if (!value) {
    return "Unpublished"
  }

  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function SceneDetail({
  detail,
  isOwn,
  onDeleted,
  onOpenAuthor,
  onOpenSlug,
  onRemix,
  onLikeChange,
  remixing,
  scene,
  liked,
}: {
  detail: CommunitySceneDetail | null
  isOwn: boolean
  onDeleted: (slug: string) => void
  onOpenAuthor: (handle: string) => void
  onOpenSlug: (slug: string) => void
  onRemix: (scene: CommunitySceneDetail) => void
  onLikeChange: (next: { count: number; liked: boolean }) => void
  remixing: boolean
  scene: CommunitySceneSummary
  liked: boolean
}) {
  const description = detail?.description ?? null
  const forkedFrom = detail?.forkedFrom ?? null
  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-4 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] min-[760px]:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-[var(--ds-space-3)]">
        <div className="flex min-w-0 items-center gap-[var(--ds-space-2)]">
          <button
            aria-label={`View scenes by @${scene.authorHandle}`}
            className="inline-flex min-w-0 cursor-pointer items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] text-left transition-opacity duration-160 hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
            onClick={() => onOpenAuthor(scene.authorHandle)}
            type="button"
          >
            <AuthorAvatar
              avatarUrl={scene.authorAvatarUrl}
              name={scene.authorName ?? scene.authorHandle}
              size={24}
            />
            <div className="flex min-w-0 flex-col">
              <Typography
                as="span"
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                variant="label"
              >
                {scene.authorName ?? `@${scene.authorHandle}`}
              </Typography>
              <Typography as="span" tone="tertiary" variant="monoXs">
                {formatPublishedAt(scene.publishedAt)}
              </Typography>
            </div>
          </button>
        </div>

        <div className="flex flex-col gap-[var(--ds-space-2)]">
          <Typography as="h3" variant="heading">
            {scene.title}
          </Typography>

          {description ? (
            <Typography as="p" tone="secondary" variant="body">
              {description}
            </Typography>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {scene.tags.filter(isCuratedSceneTag).map((tag) => (
            <Link
              className="rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-75"
              href={communityTagPath(tag) as Route}
              key={tag}
            >
              <SceneTag>{getSceneTagLabel(tag)}</SceneTag>
            </Link>
          ))}
          {scene.layerTypes.map((type) => (
            <SceneTag key={type}>{getLayerLabel(type)}</SceneTag>
          ))}
        </div>

        {forkedFrom ? (
          <button
            aria-label={lineageLabel(forkedFrom)}
            className="w-fit cursor-pointer rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
            onClick={() => onOpenSlug(forkedFrom.slug)}
            title={forkedFrom.title}
            type="button"
          >
            <RemixCredit
              lineage={forkedFrom}
              sceneAuthorHandle={scene.authorHandle}
            />
          </button>
        ) : null}

        <div className="mt-auto flex flex-col gap-[var(--ds-space-2)] pt-[var(--ds-space-3)]">
          <div className="flex items-stretch gap-[var(--ds-space-2)]">
            <LikeButton
              count={scene.likeCount}
              onChange={onLikeChange}
              slug={scene.slug}
              liked={liked}
            />

            <Button
              className="flex-1"
              disabled={remixing || !detail}
              onClick={() => detail && onRemix(detail)}
              uiSound="action.addLayer"
              variant="primary"
            >
              {remixing ? "Loading scene…" : "Remix this scene"}
              <Typography
                as="span"
                className="rounded-[4px] bg-black/12 px-1.5 py-[1px]"
                tone="onLight"
                variant="monoXs"
              >
                {scene.remixCount}
              </Typography>
            </Button>

            <ShareSceneButton slug={scene.slug} />
          </div>

          {isOwn ? (
            <DeleteSceneControl onDeleted={onDeleted} slug={scene.slug} />
          ) : (
            <ReportControl slug={scene.slug} />
          )}
        </div>
      </div>

      <div className="relative min-h-[220px] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
        {scene.thumbnailUrl ? (
          <>
            <Image
              alt=""
              aria-hidden="true"
              className="object-cover"
              fill
              priority
              sizes="(max-width: 900px) 45vw, 260px"
              src={scene.thumbnailUrl}
            />
            <Image
              alt={scene.title}
              className="object-cover"
              fill
              sizes="640px"
              src={scene.thumbnailUrl}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
