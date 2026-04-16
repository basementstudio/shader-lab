import { createRuntimeClock } from "../runtime-clock"
import { resolveEvaluatedLayers } from "../timeline"
import type { ShaderLabConfig, ShaderLabLayerConfig } from "../types"

export interface RendererSize {
  height: number
  width: number
}

export interface ProjectClock {
  delta: number
  duration: number
  loop: boolean
  time: number
}

export interface RendererFrame {
  clock: ProjectClock
  layers: ShaderLabLayerConfig[]
  logicalSize: ShaderLabConfig["composition"]
  outputSize: RendererSize
  pixelRatio: number
  viewportSize: RendererSize
}

export interface RuntimeRenderer {
  dispose(): void
  initialize(): Promise<void>
  render(frame: RendererFrame): boolean
  resize(size: RendererSize, pixelRatio: number): void
}

export function buildRendererFrame(
  config: ShaderLabConfig,
  time: number,
  delta: number,
  pixelRatio: number,
  viewportSize: RendererSize
): RendererFrame {
  const layers = resolveEvaluatedLayers(
    config.layers,
    config.timeline.tracks,
    time
  ).filter((layer) => layer.visible)

  return {
    clock: createRuntimeClock(config.timeline, time, delta),
    layers,
    logicalSize: config.composition,
    outputSize: viewportSize,
    pixelRatio,
    viewportSize,
  }
}
