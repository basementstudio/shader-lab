"use client"

import { ArrowTopRightIcon } from "@radix-ui/react-icons"
import Image from "next/image"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu"
import { Typography } from "@/components/ui/typography"
import { DEFAULT_DRAFT_TITLE } from "@/lib/community/upload-limits"
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
        aria-label={`Open ${draft.title}`}
        className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-[8px] bg-[var(--ds-color-surface-subtle)] outline-1 outline-[var(--ds-border-panel)] outline-offset-2 outline-dashed transition-[outline-color] duration-160 ease-[var(--ease-out-cubic)] disabled:cursor-wait group-hover:outline-[var(--ds-border-panel-strong)] focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-solid"
        disabled={busy}
        onClick={() => onOpen(draft)}
        type="button"
      >
        {draft.thumbnailUrl ? (
          <Image
            alt=""
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

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-[var(--ds-radius-icon)] bg-[var(--ds-color-surface-overlay)] text-[var(--ds-color-text-primary)] opacity-0 shadow-[inset_0_0_0_1px_var(--ds-border-panel)] backdrop-blur-[8px] transition-opacity duration-160 ease-[var(--ease-out-cubic)] group-hover:opacity-100"
        >
          <ArrowTopRightIcon height={14} width={14} />
        </span>
      </button>

      <div className="flex items-center gap-[var(--ds-space-2)]">
        <div className="flex min-w-0 flex-1 flex-col gap-[var(--ds-space-1)]">
          {draft.title === DEFAULT_DRAFT_TITLE ? null : (
            <Typography
              as="span"
              className="overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-160 group-hover:text-white"
              variant="title"
            >
              {draft.title}
            </Typography>
          )}
          <Typography as="span" tone="tertiary" variant="body">
            {describeSavedAt(draft.updatedAt)}
          </Typography>
        </div>

        <Menu disabled={busy} label={`Actions for ${draft.title}`}>
          <MenuItem onClick={() => onOpen(draft)}>Open</MenuItem>
          <MenuItem onClick={() => onPublish(draft)}>Publish</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => onDelete(draft)}>Delete</MenuItem>
        </Menu>
      </div>
    </div>
  )
}
