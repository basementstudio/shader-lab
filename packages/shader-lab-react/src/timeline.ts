import { evaluateCubicBezier } from "./easings"
import type {
  ShaderLabAnimatedPropertyBinding,
  ShaderLabKeyframeEasing,
  ShaderLabLayerConfig,
  ShaderLabParameterValue,
  ShaderLabTimelineInterpolation,
  ShaderLabTimelineTrack,
} from "./types"

export interface EvaluatedLayerState {
  layerId: string
  params: Record<string, ShaderLabParameterValue>
  properties: Partial<Record<"hue" | "opacity" | "saturation" | "visible", boolean | number>>
}

type NumericTuple = [number, number] | [number, number, number]

function cloneParameterValue(value: ShaderLabParameterValue): ShaderLabParameterValue {
  if (Array.isArray(value)) {
    return [...value] as ShaderLabParameterValue
  }

  return value
}

function isNumericTuple(value: ShaderLabParameterValue): value is NumericTuple {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every((entry) => typeof entry === "number")
  )
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim().toLowerCase()

  if (!normalized.startsWith("#")) {
    return null
  }

  const hex = normalized.slice(1)

  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)

    if ([r, g, b].some(Number.isNaN)) {
      return null
    }

    return [r, g, b]
  }

  return null
}

function toHex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel)))
    .toString(16)
    .padStart(2, "0")
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress
}

function migrateInterpolationToEasing(
  interpolation: ShaderLabTimelineInterpolation | undefined,
): ShaderLabKeyframeEasing | undefined {
  switch (interpolation) {
    case "step":
      return { type: "step" }
    case "smooth":
      return { controlPoints: [0.65, 0, 0.35, 1], type: "bezier" }
    case "linear":
      return { controlPoints: [0, 0, 1, 1], type: "bezier" }
    default:
      return undefined
  }
}

function resolveEasing(progress: number, easing: ShaderLabKeyframeEasing): number {
  if (easing.type === "step") return 0
  return evaluateCubicBezier(progress, easing.controlPoints)
}

function interpolateValue(
  from: ShaderLabParameterValue,
  to: ShaderLabParameterValue,
  progress: number,
  easing: ShaderLabKeyframeEasing,
): ShaderLabParameterValue {
  if (easing.type === "step") {
    return cloneParameterValue(from)
  }

  const eased = resolveEasing(progress, easing)

  if (typeof from === "number" && typeof to === "number") {
    return lerp(from, to, eased)
  }

  if (typeof from === "boolean" && typeof to === "boolean") {
    return eased < 0.5 ? from : to
  }

  if (typeof from === "string" && typeof to === "string") {
    const leftColor = parseHexColor(from)
    const rightColor = parseHexColor(to)

    if (!(leftColor && rightColor)) {
      return eased < 0.5 ? from : to
    }

    return rgbToHex(
      lerp(leftColor[0], rightColor[0], eased),
      lerp(leftColor[1], rightColor[1], eased),
      lerp(leftColor[2], rightColor[2], eased),
    )
  }

  if (isNumericTuple(from) && isNumericTuple(to) && from.length === to.length) {
    return from.map((entry, index) => lerp(entry, to[index] ?? entry, eased)) as ShaderLabParameterValue
  }

  return eased < 0.5 ? cloneParameterValue(from) : cloneParameterValue(to)
}

function evaluateTrackAtTime(
  track: ShaderLabTimelineTrack,
  time: number,
): ShaderLabParameterValue | null {
  if (!track.enabled || track.keyframes.length === 0) {
    return null
  }

  if (track.keyframes.length === 1) {
    const onlyKeyframe = track.keyframes[0]
    return onlyKeyframe ? cloneParameterValue(onlyKeyframe.value) : null
  }

  const firstKeyframe = track.keyframes[0]
  const lastKeyframe = track.keyframes[track.keyframes.length - 1]

  if (!(firstKeyframe && lastKeyframe)) {
    return null
  }

  if (time <= firstKeyframe.time) {
    return cloneParameterValue(firstKeyframe.value)
  }

  if (time >= lastKeyframe.time) {
    return cloneParameterValue(lastKeyframe.value)
  }

  const trackFallbackEasing = track.interpolation
    ? migrateInterpolationToEasing(track.interpolation)
    : undefined

  for (let index = 1; index < track.keyframes.length; index += 1) {
    const nextKeyframe = track.keyframes[index]
    const previousKeyframe = track.keyframes[index - 1]

    if (!(nextKeyframe && previousKeyframe) || time > nextKeyframe.time) {
      continue
    }

    const span = Math.max(nextKeyframe.time - previousKeyframe.time, 1e-6)
    const progress = Math.max(0, Math.min(1, (time - previousKeyframe.time) / span))

    const easing: ShaderLabKeyframeEasing = previousKeyframe.easing
      ?? trackFallbackEasing
      ?? { controlPoints: [0, 0, 1, 1], type: "bezier" }

    return interpolateValue(
      previousKeyframe.value,
      nextKeyframe.value,
      progress,
      easing,
    )
  }

  return cloneParameterValue(lastKeyframe.value)
}

function applyBindingOverride(
  state: EvaluatedLayerState,
  binding: ShaderLabAnimatedPropertyBinding,
  value: ShaderLabParameterValue,
): void {
  if (binding.kind === "param") {
    state.params[binding.key] = cloneParameterValue(value)
    return
  }

  if (binding.property === "visible" && typeof value === "boolean") {
    state.properties.visible = value
    return
  }

  if (
    (binding.property === "opacity" ||
      binding.property === "hue" ||
      binding.property === "saturation") &&
    typeof value === "number"
  ) {
    state.properties[binding.property] = value
  }
}

export function evaluateTimelineForLayers(
  layers: ShaderLabLayerConfig[],
  tracks: ShaderLabTimelineTrack[],
  time: number,
): EvaluatedLayerState[] {
  if (tracks.length === 0) {
    return []
  }

  const layerStates = new Map<string, EvaluatedLayerState>()
  const layerIds = new Set(layers.map((layer) => layer.id))

  for (const track of tracks) {
    if (!layerIds.has(track.layerId)) {
      continue
    }

    const value = evaluateTrackAtTime(track, time)

    if (value === null) {
      continue
    }

    let state = layerStates.get(track.layerId)

    if (!state) {
      state = {
        layerId: track.layerId,
        params: {},
        properties: {},
      }
      layerStates.set(track.layerId, state)
    }

    applyBindingOverride(state, track.binding, value)
  }

  return [...layerStates.values()]
}

export function resolveEvaluatedLayers(
  layers: ShaderLabLayerConfig[],
  tracks: ShaderLabTimelineTrack[],
  time: number,
): ShaderLabLayerConfig[] {
  const evaluatedStates = evaluateTimelineForLayers(layers, tracks, time)
  const evaluatedById = new Map(evaluatedStates.map((state) => [state.layerId, state]))

  return layers.map((layer) => {
    const evaluated = evaluatedById.get(layer.id)

    if (!evaluated) {
      return {
        ...layer,
        params: { ...layer.params },
      }
    }

    const params: Record<string, ShaderLabParameterValue> = {
      ...layer.params,
    }
    let mask = layer.mask

    for (const [key, value] of Object.entries(evaluated.params)) {
      if (!key.startsWith("mask.")) {
        params[key] = value
        continue
      }

      if (!mask) {
        continue
      }

      const field = key.slice(5)
      if (
        (field === "center" || field === "size") &&
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
      ) {
        mask = { ...mask, [field]: [value[0], value[1]] }
      } else if (
        (field === "rotation" || field === "feather") &&
        typeof value === "number"
      ) {
        mask = { ...mask, [field]: value }
      } else if (
        (field === "near" || field === "far") &&
        typeof value === "number"
      ) {
        const size = mask.size ?? [0, 1]
        mask = {
          ...mask,
          size: field === "near" ? [value, size[1]] : [size[0], value],
        }
      }
    }

    return {
      ...layer,
      ...(mask !== layer.mask ? { mask } : {}),
      hue:
        typeof evaluated.properties.hue === "number"
          ? evaluated.properties.hue
          : layer.hue,
      opacity:
        typeof evaluated.properties.opacity === "number"
          ? evaluated.properties.opacity
          : layer.opacity,
      params,
      saturation:
        typeof evaluated.properties.saturation === "number"
          ? evaluated.properties.saturation
          : layer.saturation,
      visible:
        typeof evaluated.properties.visible === "boolean"
          ? evaluated.properties.visible
          : layer.visible,
    }
  })
}
