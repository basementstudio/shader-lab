import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import type {
  EditorLayer,
  LayerKind,
  LayerParameterValues,
  LayerType,
  Size,
} from "@/types/editor"
import { buildParameterValues, cloneParameterValues } from "@/lib/editor/parameter-schema"

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const DEFAULT_CANVAS_SIZE: Size = {
  height: 1080,
  width: 1920,
}

export function getLayerKind(type: LayerType): LayerKind {
  return getLayerDefinition(type).kind
}

export function getDefaultLayerName(type: LayerType, existingCount: number): string {
  const definition = getLayerDefinition(type)

  return existingCount > 0
    ? `${definition.defaultName} ${existingCount + 1}`
    : definition.defaultName
}

export function createLayer(type: LayerType, existingCount = 0): EditorLayer {
  const definition = getLayerDefinition(type)

  return {
    assetId: null,
    blendMode: "normal",
    compositeMode: "filter",
    expanded: true,
    hue: 0,
    id: crypto.randomUUID(),
    kind: definition.kind,
    locked: false,
    name: getDefaultLayerName(type, existingCount),
    opacity: 1,
    params: buildParameterValues(definition.params),
    runtimeError: null,
    saturation: 1,
    type,
    visible: true,
  } as EditorLayer
}

export function cloneLayer(layer: EditorLayer): EditorLayer {
  return {
    ...layer,
    id: crypto.randomUUID(),
    name: `${layer.name} Copy`,
    params: cloneParameterValues(layer.params),
    runtimeError: null,
  }
}

export function clampLayerAdjustments(
  params: Pick<EditorLayer, "hue" | "opacity" | "saturation">,
): Pick<EditorLayer, "hue" | "opacity" | "saturation"> {
  return {
    hue: clamp(params.hue, -180, 180),
    opacity: clamp(params.opacity, 0, 1),
    saturation: clamp(params.saturation, 0, 2),
  }
}

export function resetLayerParameters(type: LayerType): LayerParameterValues {
  return buildParameterValues(getLayerDefinition(type).params)
}
