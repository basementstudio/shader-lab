"use client"

import Image from "next/image"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

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
  onSelect: (slug: string) => void
  scene: CommunitySceneSummary
}) {
  return (
    <button
      className="group flex w-full origin-center cursor-pointer flex-col gap-[var(--ds-space-2)] rounded-[10px] border border-transparent text-left transition-[transform] duration-160 ease-[var(--ease-out-cubic)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2 active:scale-[0.99]"
      onClick={() => onSelect(scene.slug)}
      type="button"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
        {scene.thumbnailUrl ? (
          <Image
            alt={scene.title}
            className="object-cover transition-transform duration-[320ms] ease-[var(--ease-out-cubic)] group-hover:scale-[1.03]"
            fill
            sizes="(max-width: 900px) 45vw, 260px"
            src={scene.thumbnailUrl}
          />
        ) : null}

        <div className="pointer-events-none absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
          <span className="text-[var(--ds-color-text-secondary)]">
            <RemixGlyph />
          </span>
          <Typography as="span" tone="secondary" variant="monoXs">
            {scene.remixCount}
          </Typography>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-[2px] px-[2px]">
        <Typography
          as="span"
          className={cn(
            "overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-160",
            "group-hover:text-white"
          )}
          variant="label"
        >
          {scene.title}
        </Typography>
        <Typography
          as="span"
          className="overflow-hidden text-ellipsis whitespace-nowrap"
          tone="tertiary"
          variant="monoXs"
        >
          @{scene.authorHandle}
        </Typography>
      </div>
    </button>
  )
}
