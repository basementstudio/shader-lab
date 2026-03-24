"use client"

import type {
  AnimatedPropertyBinding,
  EditorAsset,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
import type { useTimelineStore } from "@/store/timeline-store"

export const blendModeOptions = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
] as const

export const compositeModeOptions = [
  { label: "Filter", value: "filter" },
  { label: "Mask", value: "mask" },
] as const

const COLLAPSIBLE_PARAM_GROUPS = new Set(["Points", "Effects"])
export const DEFAULT_PARAM_GROUP = "Settings"

export type ParamGroup = {
  collapsible: boolean
  id: string
  label: string
  params: ParameterDefinition[]
}

export function getBindingKey(binding: AnimatedPropertyBinding): string {
  if (binding.kind === "layer") {
    return `layer:${binding.property}`
  }

  return `param:${binding.key}`
}

export function getSelectedAsset(
  assetById: Map<string, EditorAsset>,
  assetId: string | null
): EditorAsset | null {
  if (!assetId) {
    return null
  }

  return assetById.get(assetId) ?? null
}

export function formatLayerKind(kind: string): string {
  switch (kind) {
    case "effect":
      return "Effect"
    case "model":
      return "3D Model"
    case "source":
      return "Source"
    default:
      return kind
  }
}

export function toColorValue(value: ParameterValue): string {
  return typeof value === "string" ? value : "#ffffff"
}

export function toVec2Value(value: ParameterValue): [number, number] {
  return Array.isArray(value) && value.length === 2
    ? [value[0] ?? 0, value[1] ?? 0]
    : [0, 0]
}

export function toNumberValue(value: ParameterValue, fallback = 0): number {
  return typeof value === "number" ? value : fallback
}

export function toBooleanValue(value: ParameterValue): boolean {
  return value === true
}

export function toTextValue(value: ParameterValue, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

export function resolveParamValue(
  params: Record<string, ParameterValue>,
  definitions: ParameterDefinition[],
  key: string
): ParameterValue | undefined {
  const explicitValue = params[key]
  if (explicitValue !== undefined) {
    return explicitValue
  }

  const definition = definitions.find((entry) => entry.key === key)
  return definition?.defaultValue
}

export function isParamVisible(
  definition: ParameterDefinition,
  params: Record<string, ParameterValue>,
  definitions: ParameterDefinition[]
): boolean {
  if (!definition.visibleWhen) {
    return true
  }

  const controllingValue = resolveParamValue(
    params,
    definitions,
    definition.visibleWhen.key
  )

  if ("equals" in definition.visibleWhen) {
    return controllingValue === definition.visibleWhen.equals
  }

  return (
    typeof controllingValue === "number" &&
    controllingValue >= definition.visibleWhen.gte
  )
}

export function groupVisibleParams(params: ParameterDefinition[]): ParamGroup[] {
  const groups = new Map<string, ParamGroup>()

  for (const param of params) {
    const label = param.group ?? DEFAULT_PARAM_GROUP
    const id = label.toLowerCase().replace(/\s+/g, "-")
    const existing = groups.get(id)

    if (existing) {
      existing.params.push(param)
      continue
    }

    groups.set(id, {
      collapsible: COLLAPSIBLE_PARAM_GROUPS.has(label),
      id,
      label,
      params: [param],
    })
  }

  return [...groups.values()]
}

export function createParamTimelineBinding(
  definition: ParameterDefinition
): AnimatedPropertyBinding | null {
  if (definition.type === "text") {
    return null
  }

  return {
    key: definition.key,
    kind: "param",
    label: definition.label,
    valueType: definition.type === "boolean" ? "boolean" : definition.type,
  }
}

export function hasTrackForBinding(
  tracks: ReturnType<typeof useTimelineStore.getState>["tracks"],
  layerId: string,
  binding: AnimatedPropertyBinding
): boolean {
  const bindingKey = getBindingKey(binding)

  return tracks.some(
    (track) =>
      track.layerId === layerId && getBindingKey(track.binding) === bindingKey
  )
}
