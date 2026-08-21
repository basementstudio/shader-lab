"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/select"
import {
  ALL_COMMUNITY_LAYERS_VALUE,
  COMMUNITY_LAYER_FILTER_OPTIONS,
  isCommunityLayerType,
} from "@/lib/community/scene-layer-filter"
import { COMMUNITY_PATH, communityLayerPath } from "@/lib/community/scene-links"
import type { LayerType } from "@/types/editor"

export function PublicSceneLayerFilter({ layer }: { layer?: LayerType }) {
  const router = useRouter()

  return (
    <Select
      onValueChange={(value) => {
        router.push(
          (isCommunityLayerType(value)
            ? communityLayerPath(value)
            : COMMUNITY_PATH) as Route
        )
      }}
      options={COMMUNITY_LAYER_FILTER_OPTIONS}
      popupClassName="min-w-[200px]"
      triggerAriaLabel="Filter scenes by layer"
      triggerClassName="w-[180px]"
      value={layer ?? ALL_COMMUNITY_LAYERS_VALUE}
    />
  )
}
