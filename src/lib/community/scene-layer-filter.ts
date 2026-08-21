import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import {
  EFFECT_LAYER_TYPES,
  type LayerType,
  MODEL_LAYER_TYPES,
  SOURCE_LAYER_TYPES,
} from "@/types/editor"

export const COMMUNITY_LAYER_TYPES: readonly LayerType[] = [
  ...SOURCE_LAYER_TYPES,
  ...EFFECT_LAYER_TYPES,
  ...MODEL_LAYER_TYPES,
].sort((left, right) => getLayerLabel(left).localeCompare(getLayerLabel(right)))

export const ALL_COMMUNITY_LAYERS_VALUE = "__all_layers__"

export const COMMUNITY_LAYER_FILTER_OPTIONS = [
  { label: "All layers", value: ALL_COMMUNITY_LAYERS_VALUE },
  ...COMMUNITY_LAYER_TYPES.map((layer) => ({
    label: getLayerLabel(layer),
    value: layer,
  })),
] as const

const COMMUNITY_LAYER_TYPE_SET = new Set<LayerType>(COMMUNITY_LAYER_TYPES)

export function isCommunityLayerType(value: unknown): value is LayerType {
  return (
    typeof value === "string" &&
    COMMUNITY_LAYER_TYPE_SET.has(value as LayerType)
  )
}
