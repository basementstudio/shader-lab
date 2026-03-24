import { easings } from "@/lib/easings"
import type {
  AnimatedPropertyBinding,
  EditorLayer,
  LayerAnimatableProperty,
  LayerParameterValues,
  ParameterValue,
  TimelineInterpolation,
  TimelineTrack,
} from "@/types/editor"
import { cloneParameterValue } from "@/lib/editor/parameter-schema"

export interface EvaluatedLayerState {
  layerId: string
  params: LayerParameterValues
  properties: Partial<Record<LayerAnimatableProperty, boolean | number>>
}

type NumericTuple = [number, number] | [number, number, number]

function isNumericTuple(value: ParameterValue): value is NumericTuple {
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

  if (hex.length === 3 || hex.length === 4) {
    const first = hex[0]
    const second = hex[1]
    const third = hex[2]

    if (!(first && second && third)) {
      return null
    }

    const r = Number.parseInt(first + first, 16)
    const g = Number.parseInt(second + second, 16)
    const b = Number.parseInt(third + third, 16)

    if ([r, g, b].some(Number.isNaN)) {
      return null
    }

    return [r, g, b]
  }

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

function resolveProgress(progress: number, interpolation: TimelineInterpolation): number {
  if (interpolation === "step") {
    return 0
  }

  if (interpolation === "smooth") {
    return easings.easeInOutCubic(progress)
  }

  return progress
}

function interpolateValue(
  from: ParameterValue,
  to: ParameterValue,
  progress: number,
  interpolation: TimelineInterpolation,
): ParameterValue {
  if (interpolation === "step") {
    return cloneParameterValue(from)
  }

  const eased = resolveProgress(progress, interpolation)

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
    return from.map((entry, index) => lerp(entry, to[index] ?? entry, eased)) as ParameterValue
  }

  return eased < 0.5 ? cloneParameterValue(from) : cloneParameterValue(to)
}

function evaluateTrackAtTime(track: TimelineTrack, time: number): ParameterValue | null {
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

  for (let index = 1; index < track.keyframes.length; index += 1) {
    const nextKeyframe = track.keyframes[index]
    const previousKeyframe = track.keyframes[index - 1]

    if (!(nextKeyframe && previousKeyframe) || time > nextKeyframe.time) {
      continue
    }

    const span = Math.max(nextKeyframe.time - previousKeyframe.time, 1e-6)
    const progress = Math.max(0, Math.min(1, (time - previousKeyframe.time) / span))

    return interpolateValue(
      previousKeyframe.value,
      nextKeyframe.value,
      progress,
      track.interpolation,
    )
  }

  return cloneParameterValue(lastKeyframe.value)
}

function applyBindingOverride(
  state: EvaluatedLayerState,
  binding: AnimatedPropertyBinding,
  value: ParameterValue,
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
  layers: EditorLayer[],
  tracks: TimelineTrack[],
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
