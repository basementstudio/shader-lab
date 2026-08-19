"use client"

import { EmptyState } from "@/components/community/empty-state"
import { Button } from "@/components/ui/button"

function EmptyGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={28}
      viewBox="0 0 32 32"
      width={28}
    >
      <rect
        height={19}
        rx={2.5}
        stroke="currentColor"
        strokeWidth={1.5}
        width={25}
        x={3.5}
        y={6.5}
      />
      <path
        d="M3.5 21.5 11 15l6 5 4.5-3.5 7 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <circle cx={20.5} cy={12} fill="currentColor" r={1.6} />
    </svg>
  )
}

export function SceneEmptyState({
  onClearSearch,
  query,
}: {
  onClearSearch: () => void
  query: string
}) {
  const searching = query.trim().length > 0

  return (
    <EmptyState
      action={
        searching ? (
          <Button onClick={onClearSearch} size="compact" variant="secondary">
            Clear search
          </Button>
        ) : null
      }
      description={
        searching
          ? "Try a different title, or an author's name or handle."
          : "Published scenes show up here. Build something in the editor and publish it to be the first."
      }
      glyph={<EmptyGlyph />}
      title={
        searching ? "No scenes match that search" : "No scenes published yet"
      }
    />
  )
}
