"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/select"
import {
  ALL_COMMUNITY_EFFECTS_VALUE,
  COMMUNITY_EFFECT_FILTER_OPTIONS,
  isCommunityEffectType,
} from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  communityEffectPath,
} from "@/lib/community/scene-links"
import type { EffectLayerType } from "@/types/editor"

export function PublicSceneEffectFilter({
  effect,
}: {
  effect?: EffectLayerType
}) {
  const router = useRouter()

  return (
    <Select
      onValueChange={(value) => {
        router.push(
          (isCommunityEffectType(value)
            ? communityEffectPath(value)
            : COMMUNITY_PATH) as Route
        )
      }}
      options={COMMUNITY_EFFECT_FILTER_OPTIONS}
      popupClassName="min-w-[200px]"
      triggerAriaLabel="Filter scenes by effect"
      triggerClassName="w-[180px]"
      value={effect ?? ALL_COMMUNITY_EFFECTS_VALUE}
    />
  )
}
