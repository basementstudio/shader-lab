import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import {
  EFFECT_LAYER_TYPES,
  type EffectLayerType,
  type LayerType,
} from "@/types/editor"

export const COMMUNITY_EFFECT_TYPES: readonly EffectLayerType[] = [
  ...EFFECT_LAYER_TYPES,
].sort((left, right) => getLayerLabel(left).localeCompare(getLayerLabel(right)))

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

export function getCommunityEffectSelection(
  value: unknown
): EffectLayerType[] {
  const values = Array.isArray(value) ? value : [value]
  const selected = new Set(values.filter(isCommunityEffectType))

  return COMMUNITY_EFFECT_TYPES.filter((effect) => selected.has(effect))
}

export function getCommunitySceneEffects(
  layerTypes: readonly LayerType[]
): EffectLayerType[] {
  return layerTypes.filter(isCommunityEffectType)
}
