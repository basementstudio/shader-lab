"use client"

import { EmptyState } from "@/components/community/empty-state"
import { Button } from "@/components/ui/button"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { EffectLayerType } from "@/types/editor"

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
  onClearFilters,
  effects,
  query,
}: {
  onClearFilters: () => void
  effects: readonly EffectLayerType[]
  query: string
}) {
  const searching = query.trim().length > 0
  const filtered = searching || effects.length > 0
  let description =
    "Published scenes show up here. Build something in the editor and publish it to be the first."
  let title = "No scenes published yet"

  if (effects.length > 0) {
    description =
      "Remove an effect, or clear the filters to explore every scene."
    title =
      effects.length === 1
        ? `No scenes using ${getLayerLabel(effects[0]!)} yet`
        : "No scenes use all selected effects yet"
  }

  if (searching) {
    description = "Try a different title, or an author's name or handle."
    title = "No scenes match that search"
  }

  return (
    <EmptyState
      action={
        filtered ? (
          <Button onClick={onClearFilters} variant="secondary">
            Clear filter
          </Button>
        ) : null
      }
      description={description}
      glyph={<EmptyGlyph />}
      title={title}
    />
  )
}
