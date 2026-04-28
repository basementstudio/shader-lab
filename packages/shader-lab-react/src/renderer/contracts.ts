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
  logicalSize: RendererSize
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

export const DEFAULT_RENDERER_SIZE: RendererSize = {
  height: 1,
  width: 1,
}

export function buildRendererFrame(
  config: ShaderLabConfig,
  time: number,
  delta: number,
  pixelRatio: number,
  viewportSize: RendererSize,
  options?: {
    logicalSize?: RendererSize
  }
): RendererFrame {
  const layers = resolveEvaluatedLayers(
    config.layers,
    config.timeline.tracks,
    time
  ).filter((layer) => layer.visible)

  return {
    clock: createRuntimeClock(config.timeline, time, delta),
    layers,
    logicalSize: options?.logicalSize ?? config.composition ?? viewportSize,
    outputSize: viewportSize,
    pixelRatio,
    viewportSize,
  }
}
