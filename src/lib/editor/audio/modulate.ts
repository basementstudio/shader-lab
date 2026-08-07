import { cloneParameterValue } from "@/lib/editor/parameter-schema"
import type {
  AudioLink,
  LayerAnimatableProperty,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"

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
    return null
  }

  if (!Array.isArray(base) || base.length !== expectedLength) {
    return expectedLength === 2 ? [scalar, scalar] : [scalar, scalar, scalar]
  }

  const next = cloneParameterValue(base)

  if (!Array.isArray(next)) {
    return null
  }

  next[index] = scalar

  return next as ParameterValue
}

export function resolveBooleanValue(
  link: AudioLink,
  bandValue: number
): boolean {
  return bandValue >= (link.threshold ?? DEFAULT_BOOLEAN_THRESHOLD)
}

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
      return null
  }
}
