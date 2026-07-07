import type { ShaderLabEffectLayerType } from "../types"
import type { LayerParameterValues } from "../types/editor"

export const INNER_EFFECT_NONE = "none"

/**
 * Effect types renderable as a blob interior: every effect with a pass,
 * except blob-tracking itself (no recursive children in v1). Mirrors
 * `src/lib/blob-tracking/inner-effects.ts` in the editor app, minus the
 * registry-driven default filling — package passes apply their own
 * per-parameter fallbacks in `updateParams`.
 */
export const INNER_EFFECT_TYPES: readonly ShaderLabEffectLayerType[] = [
  "ascii",
  "bloom",
  "circuit-bent",
  "directional-blur",
  "chromatic-aberration",
  "crt",
  "displacement-map",
  "dithering",
  "edge-detect",
  "fluted-glass",
  "halftone",
  "ink",
  "particle-grid",
  "pattern",
  "pixelation",
  "pixel-sorting",
  "plotter",
  "posterize",
  "slice",
  "smear",
  "threshold",
  "voxel",
]

export type ShaderLabBlobInnerEffect =
  | Exclude<ShaderLabEffectLayerType, "blob-tracking">
  | typeof INNER_EFFECT_NONE

const INNER_EFFECT_TYPE_SET = new Set<string>([
  INNER_EFFECT_NONE,
  ...INNER_EFFECT_TYPES,
])

export function isInnerEffectType(
  value: unknown
): value is ShaderLabBlobInnerEffect {
  return typeof value === "string" && INNER_EFFECT_TYPE_SET.has(value)
}

function isParameterValue(
  value: unknown
): value is LayerParameterValues[string] {
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

/**
 * Tolerant parse of the `innerEffectParams` JSON string. Bad JSON or
 * non-object input yields an empty record; values with impossible runtime
 * shapes are dropped. Passes fill in their own defaults for missing keys.
 */
export function parseInnerEffectParams(raw: unknown): LayerParameterValues {
  let record: Record<string, unknown> = {}

  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>
      }
    } catch {
      record = {}
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    record = raw as Record<string, unknown>
  }

  const values: LayerParameterValues = {}
  for (const [key, candidate] of Object.entries(record)) {
    if (isParameterValue(candidate)) {
      values[key] = candidate
    }
  }
  return values
}
