import { createRuntimeClock } from "./runtime-clock"
import { resolveEvaluatedLayers } from "./timeline"
import type { ShaderLabConfig, ShaderLabLayerConfig } from "./types"

export interface ShaderLabRenderableLayer {
  layer: ShaderLabLayerConfig
}

export interface ShaderLabRuntimeFrame {
  clock: ReturnType<typeof createRuntimeClock>
  composition: ShaderLabConfig["composition"]
  layers: ShaderLabRenderableLayer[]
}

export function buildRuntimeFrame(
  config: ShaderLabConfig,
  time: number,
  delta: number,
): ShaderLabRuntimeFrame {
  const layers = resolveEvaluatedLayers(config.layers, config.timeline.tracks, time)
    .filter((layer) => layer.visible)
    .map((layer) => ({ layer }))

  return {
    clock: createRuntimeClock(config.timeline, time, delta),
    composition: config.composition,
    layers,
  }
}
