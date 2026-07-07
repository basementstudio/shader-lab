/**
 * Inner-effect set for the blob-tracking layer: the effect layer types whose
 * pass can be rendered inside detected shapes, plus tolerant (de)serialization
 * of their parameter overrides.
 *
 * The set is every effect layer type that has a pass implementation — i.e.
 * `EFFECT_LAYER_TYPES` minus `"blur"`, which is registered but has no pass in
 * either renderer tree. `parseInnerEffectParams` is deliberately forgiving so
 * hand-edited or cross-version `.lab` files never break the import: bad JSON
 * yields defaults, unknown keys are dropped, and values whose runtime shape
 * does not match the parameter definition are ignored.
 */

import { buildParameterValues } from "@/lib/editor/parameter-schema"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  EFFECT_LAYER_TYPES,
  type EffectLayerType,
  type LayerParameterValues,
  type ParameterDefinition,
  type ParameterValue,
} from "@/types/editor"

export const INNER_EFFECT_NONE = "none"

/** Effect types renderable as a blob interior (every effect with a pass). */
export const INNER_EFFECT_TYPES: readonly EffectLayerType[] =
  EFFECT_LAYER_TYPES.filter((type) => type !== "blur")

export type InnerEffectType = EffectLayerType | typeof INNER_EFFECT_NONE

const INNER_EFFECT_TYPE_SET = new Set<string>([
  INNER_EFFECT_NONE,
  ...INNER_EFFECT_TYPES,
])

export function isInnerEffectType(value: unknown): value is InnerEffectType {
  return typeof value === "string" && INNER_EFFECT_TYPE_SET.has(value)
}

function isParameterValue(value: unknown): value is ParameterValue {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every((entry) => typeof entry === "number")
  )
}

function valueMatchesDefinition(
  definition: ParameterDefinition,
  value: ParameterValue
): boolean {
  switch (definition.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "boolean":
      return typeof value === "boolean"
    case "select":
    case "color":
    case "text":
      return typeof value === "string"
    case "vec2":
      return Array.isArray(value) && value.length === 2
    case "vec3":
      return Array.isArray(value) && value.length === 3
    default:
      return false
  }
}

function toRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

/**
 * Resolve inner-effect parameter overrides for `type` against its definition
 * defaults. Unknown types throw; `"none"` has no parameters.
 */
export function parseInnerEffectParams(
  type: InnerEffectType,
  raw: unknown
): LayerParameterValues {
  if (!isInnerEffectType(type)) {
    throw new Error(`Unknown inner effect type: ${String(type)}`)
  }
  if (type === INNER_EFFECT_NONE) {
    return {}
  }

  const definitions = getLayerDefinition(type).params
  const values = buildParameterValues(definitions)
  const definitionByKey = new Map(
    definitions.map((definition) => [definition.key, definition])
  )
  const record = toRecord(raw)

  for (const [key, candidate] of Object.entries(record)) {
    const definition = definitionByKey.get(key)
    if (
      definition &&
      isParameterValue(candidate) &&
      valueMatchesDefinition(definition, candidate)
    ) {
      values[key] = candidate
    }
  }

  return values
}

export function serializeInnerEffectParams(values: LayerParameterValues): string {
  return JSON.stringify(values)
}
