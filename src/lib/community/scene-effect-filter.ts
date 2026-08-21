import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import {
  EFFECT_LAYER_TYPES,
  type EffectLayerType,
  type LayerType,
} from "@/types/editor"

export const COMMUNITY_EFFECT_TYPES: readonly EffectLayerType[] = [
  ...EFFECT_LAYER_TYPES,
].sort((left, right) => getLayerLabel(left).localeCompare(getLayerLabel(right)))

export const ALL_COMMUNITY_EFFECTS_VALUE = "__all_effects__"

export const COMMUNITY_EFFECT_FILTER_OPTIONS = [
  { label: "All effects", value: ALL_COMMUNITY_EFFECTS_VALUE },
  ...COMMUNITY_EFFECT_TYPES.map((effect) => ({
    label: getLayerLabel(effect),
    value: effect,
  })),
] as const

const COMMUNITY_EFFECT_TYPE_SET = new Set<EffectLayerType>(
  COMMUNITY_EFFECT_TYPES
)

export function isCommunityEffectType(
  value: unknown
): value is EffectLayerType {
  return (
    typeof value === "string" &&
    COMMUNITY_EFFECT_TYPE_SET.has(value as EffectLayerType)
  )
}

export function getCommunitySceneEffects(
  layerTypes: readonly LayerType[]
): EffectLayerType[] {
  return layerTypes.filter(isCommunityEffectType)
}
