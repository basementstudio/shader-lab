import { cloneParameterValue } from "@/lib/editor/parameter-schema"
import type {
  AudioLink,
  LayerAnimatableProperty,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"

/** Matches the bounds enforced by `clampLayerAdjustments` in `lib/editor/layers.ts`. */
const LAYER_PROPERTY_BOUNDS: Record<
  "hue" | "opacity" | "saturation",
  { max: number; min: number }
> = {
  hue: { max: 180, min: -180 },
  opacity: { max: 1, min: 0 },
  saturation: { max: 2, min: 0 },
}

const DEFAULT_BOOLEAN_THRESHOLD = 0.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Range remap: the band's `[0,1]` envelope onto the link's output range.
 *
 * `outMin > outMax` is legal and inverts the response. Because envelope samples
 * are guaranteed to be in `[0,1]`, the result always lies between the two
 * bounds — the clamps applied afterwards guard against a bad `outMin`/`outMax`,
 * not against the envelope.
 */
export function remapBand(
  bandValue: number,
  outMin: number,
  outMax: number
): number {
  if (!Number.isFinite(bandValue)) {
    return outMin
  }

  return outMin + (outMax - outMin) * clamp(bandValue, 0, 1)
}

function quantizeToStep(value: number, step: number | undefined): number {
  if (!step || step <= 0) {
    return value
  }

  return Math.round(value / step) * step
}

/**
 * Resolve a numeric parameter value.
 *
 * Clamps only against bounds the definition actually declares. The properties
 * sidebar falls back to `min 0 / max 100` for sliders, but those are widget
 * affordances — applying them here would invent a ceiling the shader does not
 * have (e.g. on an unbounded `scale`).
 *
 * `step` is not honoured by default: `updateLayerParam` does not enforce it and
 * keyframe interpolation produces continuous values, so quantizing would make
 * audio the only modulation source that snaps. Opt in per link via `quantize`.
 */
export function resolveNumberValue(
  link: AudioLink,
  definition: ParameterDefinition,
  bandValue: number
): number {
  const raw = remapBand(bandValue, link.outMin, link.outMax)

  const min = "min" in definition ? definition.min : undefined
  const max = "max" in definition ? definition.max : undefined
  const step = "step" in definition ? definition.step : undefined

  let value = clamp(
    raw,
    min ?? Number.NEGATIVE_INFINITY,
    max ?? Number.POSITIVE_INFINITY
  )

  if (link.quantize) {
    value = quantizeToStep(value, step)
  }

  if (definition.type === "number" && definition.input === "int") {
    value = Math.round(value)
  }

  // Rounding or quantizing can push back past a bound.
  return clamp(
    value,
    min ?? Number.NEGATIVE_INFINITY,
    max ?? Number.POSITIVE_INFINITY
  )
}

function componentIndex(link: AudioLink): number | "all" {
  switch (link.component) {
    case "x":
      return 0
    case "y":
      return 1
    case "z":
      return 2
    default:
      return "all"
  }
}

/**
 * Resolve a vec2/vec3 value.
 *
 * `base` is the value the parameter would otherwise have this frame (keyframe
 * result if present, else the stored value). It is cloned before any
 * per-component write — mutating it would corrupt both the layer store and the
 * `paramsCloneCache` WeakMap in `renderer/contracts.ts`, producing drift that
 * persists across frames.
 */
export function resolveVectorValue(
  link: AudioLink,
  definition: ParameterDefinition,
  base: ParameterValue | undefined,
  bandValue: number
): ParameterValue | null {
  const expectedLength = definition.type === "vec2" ? 2 : 3

  const min = "min" in definition ? definition.min : undefined
  const max = "max" in definition ? definition.max : undefined
  const scalar = clamp(
    remapBand(bandValue, link.outMin, link.outMax),
    min ?? Number.NEGATIVE_INFINITY,
    max ?? Number.POSITIVE_INFINITY
  )

  const index = componentIndex(link)

  if (index === "all") {
    return expectedLength === 2
      ? [scalar, scalar]
      : [scalar, scalar, scalar]
  }

  if (index >= expectedLength) {
    // e.g. component "z" on a vec2 — skip rather than throw.
    return null
  }

  if (!Array.isArray(base) || base.length !== expectedLength) {
    // No usable base to merge into; fall back to driving every component.
    return expectedLength === 2 ? [scalar, scalar] : [scalar, scalar, scalar]
  }

  const next = cloneParameterValue(base)

  if (!Array.isArray(next)) {
    return null
  }

  next[index] = scalar

  return next as ParameterValue
}

/**
 * Threshold gate for boolean bindings.
 *
 * Deliberately has no hysteresis: a Schmitt trigger depends on the previous
 * output, which would make the result differ when scrubbing backwards, and
 * differ between the live loop and `prewarmExportFrame`'s repeated renders of
 * one timestamp. Chatter is controlled by the band's release time instead.
 */
export function resolveBooleanValue(
  link: AudioLink,
  bandValue: number
): boolean {
  return bandValue >= (link.threshold ?? DEFAULT_BOOLEAN_THRESHOLD)
}

/** Resolve a value for an animatable *layer* property rather than a parameter. */
export function resolveLayerPropertyValue(
  link: AudioLink,
  property: LayerAnimatableProperty,
  bandValue: number
): boolean | number | null {
  if (property === "visible") {
    return resolveBooleanValue(link, bandValue)
  }

  const bounds = LAYER_PROPERTY_BOUNDS[property]

  if (!bounds) {
    return null
  }

  return clamp(
    remapBand(bandValue, link.outMin, link.outMax),
    bounds.min,
    bounds.max
  )
}

/**
 * Resolve the value a single link produces, or `null` when it cannot apply.
 *
 * Exported so the UI can render a live readout for a modulated parameter
 * without running the whole frame pipeline.
 */
export function resolveAudioLinkValue(
  link: AudioLink,
  definition: ParameterDefinition | null,
  base: ParameterValue | undefined,
  bandValue: number
): ParameterValue | null {
  if (link.binding.kind === "layer") {
    return resolveLayerPropertyValue(link, link.binding.property, bandValue)
  }

  if (!definition) {
    return null
  }

  switch (definition.type) {
    case "number":
      return resolveNumberValue(link, definition, bandValue)
    case "boolean":
      return resolveBooleanValue(link, bandValue)
    case "vec2":
    case "vec3":
      return resolveVectorValue(link, definition, base, bandValue)
    default:
      // color/select/text carry no numeric range to remap onto.
      return null
  }
}
