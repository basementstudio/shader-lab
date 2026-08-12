"use client"

import { ArrowLeftIcon } from "@radix-ui/react-icons"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { CommunitySceneDetail } from "@/lib/community/scenes"

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
  onBack,
  onRemix,
  remixing,
  scene,
}: {
  onBack: () => void
  onRemix: (scene: CommunitySceneDetail) => void
  remixing: boolean
  scene: CommunitySceneDetail
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[var(--ds-space-2)] border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
        <IconButton
          aria-label="Back to scenes"
          className="h-7 w-7"
          onClick={onBack}
          variant="default"
        >
          <ArrowLeftIcon height={16} width={16} />
        </IconButton>
        <Typography as="h2" className="leading-5" variant="title">
          {scene.title}
        </Typography>
      </div>

      <div className="max-h-[min(66vh,600px)] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-[var(--ds-space-3)] px-4 py-[var(--ds-space-3)]">
          <div className="flex min-w-0 flex-col gap-[2px]">
            <Typography as="p" tone="tertiary" variant="caption">
              @{scene.authorHandle} · {formatPublishedAt(scene.publishedAt)}
            </Typography>
          </div>

          <Button
            disabled={remixing}
            onClick={() => onRemix(scene)}
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
        </div>

        <div className="relative h-[min(40vh,360px)] w-full overflow-hidden border-y border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-subtle)]">
          {scene.thumbnailUrl ? (
            <Image
              alt={scene.title}
              className="object-cover"
              fill
              priority
              sizes="1080px"
              src={scene.thumbnailUrl}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-[var(--ds-space-4)] p-4">
          {scene.description ? (
            <Typography as="p" tone="secondary" variant="body">
              {scene.description}
            </Typography>
          ) : null}

          <div className="flex flex-col gap-[var(--ds-space-2)]">
            <Typography as="h4" tone="tertiary" variant="overline">
              Layers used
            </Typography>
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
          </div>

          {scene.forkedFrom ? (
            <Typography as="p" tone="tertiary" variant="caption">
              Forked from {scene.forkedFrom.title}
            </Typography>
          ) : null}
        </div>
      </div>
    </div>
  )
}
