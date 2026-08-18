"use client"

import { DraftCard } from "@/components/community/draft-card"
import type { DraftSummary } from "@/lib/community/scenes"

export function DraftsGrid({
  busyId,
  drafts,
  onDelete,
  onOpen,
}: {
  busyId: string | null
  drafts: DraftSummary[]
  onDelete: (draft: DraftSummary) => void
  onOpen: (draft: DraftSummary) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
      {drafts.map((draft) => (
        <DraftCard
          busy={busyId === draft.id}
          draft={draft}
          key={draft.id}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
