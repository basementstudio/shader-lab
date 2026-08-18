"use client"

import { TrashIcon } from "@radix-ui/react-icons"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import type { DraftSummary } from "@/lib/community/scenes"

const RELATIVE_STEPS: readonly { label: string; ms: number }[] = [
  { label: "day", ms: 86_400_000 },
  { label: "hour", ms: 3_600_000 },
  { label: "minute", ms: 60_000 },
]

export function describeSavedAt(updatedAt: string, now = Date.now()): string {
  const elapsed = now - new Date(updatedAt).getTime()

  if (!Number.isFinite(elapsed) || elapsed < 60_000) {
    return "Saved just now"
  }

  for (const step of RELATIVE_STEPS) {
    const count = Math.floor(elapsed / step.ms)

    if (count >= 1) {
      return `Saved ${count} ${step.label}${count === 1 ? "" : "s"} ago`
    }
  }

  return "Saved just now"
}

export function describeDraftContents(draft: DraftSummary): string {
  if (draft.layerTypes.length === 0) {
    return "Empty scene"
  }

  return draft.layerTypes.slice(0, 3).join(", ")
}

export function DraftCard({
  busy,
  draft,
  onDelete,
  onOpen,
  onPublish,
}: {
  busy: boolean
  draft: DraftSummary
  onDelete: (draft: DraftSummary) => void
  onOpen: (draft: DraftSummary) => void
  onPublish: (draft: DraftSummary) => void
}) {
  return (
    <div className="group relative flex flex-col gap-[var(--ds-space-2)]">
      <button
        className="flex w-full cursor-pointer flex-col gap-[var(--ds-space-2)] rounded-[10px] text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2 disabled:cursor-wait"
        disabled={busy}
        onClick={() => onOpen(draft)}
        type="button"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
          {draft.thumbnailUrl ? (
            <Image
              alt={draft.title}
              className="object-cover"
              fill
              sizes="(max-width: 900px) 45vw, 260px"
              src={draft.thumbnailUrl}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-3">
              <Typography
                align="center"
                as="span"
                tone="tertiary"
                variant="monoXs"
              >
                {describeDraftContents(draft)}
              </Typography>
            </span>
          )}

          <div className="pointer-events-none absolute top-1.5 left-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
            <Typography as="span" tone="secondary" variant="monoXs">
              draft
            </Typography>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[5px] px-[2px]">
          <Typography
            as="span"
            className="overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-160 group-hover:text-white"
            variant="label"
          >
            {draft.title}
          </Typography>
          <Typography as="span" tone="tertiary" variant="caption">
            {describeSavedAt(draft.updatedAt)}
          </Typography>
        </div>
      </button>

      <div className="flex items-center gap-[var(--ds-space-2)] px-[2px]">
        <Button
          disabled={busy}
          onClick={() => onPublish(draft)}
          size="compact"
          variant="primary"
        >
          Publish
        </Button>
        <Button
          disabled={busy}
          onClick={() => onOpen(draft)}
          size="compact"
          variant="secondary"
        >
          Open
        </Button>
      </div>

      <IconButton
        aria-label={`Delete ${draft.title}`}
        className="absolute top-1.5 right-1.5 h-7 w-7 opacity-0 transition-opacity duration-160 focus-visible:opacity-100 group-hover:opacity-100"
        disabled={busy}
        onClick={() => onDelete(draft)}
        variant="default"
      >
        <TrashIcon height={14} width={14} />
      </IconButton>
    </div>
  )
}
