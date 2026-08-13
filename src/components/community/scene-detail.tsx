"use client"

import Image from "next/image"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { DeleteSceneControl } from "@/components/community/delete-scene-control"
import { ReportControl } from "@/components/community/report-control"
import { ShareSceneButton } from "@/components/community/share-scene-button"
import { UpvoteButton } from "@/components/community/upvote-button"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import type {
  CommunitySceneDetail,
  CommunitySceneSummary,
} from "@/lib/community/scenes"
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
  onRemix,
  onUpvoteChange,
  remixing,
  scene,
  upvoted,
}: {
  detail: CommunitySceneDetail | null
  isOwn: boolean
  onDeleted: (slug: string) => void
  onRemix: (scene: CommunitySceneDetail) => void
  onUpvoteChange: (next: { count: number; upvoted: boolean }) => void
  remixing: boolean
  scene: CommunitySceneSummary
  upvoted: boolean
}) {
  const description = detail?.description ?? null
  const forkedFrom = detail?.forkedFrom ?? null
  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-4 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] min-[760px]:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-[var(--ds-space-3)]">
        <div className="flex min-w-0 items-center gap-[var(--ds-space-2)]">
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
          {scene.layerTypes.map((type) => (
            <span
              className="inline-flex min-h-6 items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] px-2"
              key={type}
            >
              <Typography as="span" tone="secondary" variant="monoXs">
                {getLayerLabel(type)}
              </Typography>
            </span>
          ))}
          {scene.hasCustomShader ? (
            <span className="inline-flex min-h-6 items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] px-2">
              <Typography as="span" variant="monoXs">
                Custom shader
              </Typography>
            </span>
          ) : null}
        </div>

        {forkedFrom ? (
          <Typography as="p" tone="tertiary" variant="caption">
            Remixed from {forkedFrom.title}
          </Typography>
        ) : null}

        <div className="mt-auto flex flex-col gap-[var(--ds-space-2)] pt-[var(--ds-space-3)]">
          <div className="flex items-stretch gap-[var(--ds-space-2)]">
            <UpvoteButton
              count={scene.likeCount}
              onChange={onUpvoteChange}
              slug={scene.slug}
              upvoted={upvoted}
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
