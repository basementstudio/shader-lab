"use client"

import { PublicSceneEffectFilter } from "@/components/community/public-scene-effect-filter"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import type { CommunitySceneSummary } from "@/lib/community/scenes"
import { useCommunityEffects } from "@/lib/community/use-community-effects"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { EffectLayerType } from "@/types/editor"

function emptyLabelFor(effects: readonly EffectLayerType[]): string {
  if (effects.length === 1) {
    return `No scenes using ${getLayerLabel(effects[0]!)} published yet.`
  }

  if (effects.length > 1) {
    return "No scenes use all selected effects yet."
  }

  return "No scenes published yet."
}

export function CommunityScenesBrowser({
  initialNextCursor,
  initialScenes,
}: {
  initialNextCursor: string | null
  initialScenes: CommunitySceneSummary[]
}) {
  const { effects, select } = useCommunityEffects()
  const filtered = effects.length > 0

  return (
    <>
      <PublicSceneEffectFilter effects={effects} onSelect={select} />

      <PublicSceneGrid
        effects={effects}
        emptyLabel={emptyLabelFor(effects)}
        initialNextCursor={filtered ? null : initialNextCursor}
        initialScenes={filtered ? null : initialScenes}
      />
    </>
  )
}
