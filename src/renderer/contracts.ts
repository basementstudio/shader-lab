import type {
  EditorAsset,
  EditorLayer,
  LayerParameterValues,
  Size,
  TimelineStateSnapshot,
} from "@/types/editor"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { createProjectClock } from "@/renderer/project-clock"
import { cloneParameterValues } from "@/lib/editor/parameter-schema"

export interface ProjectClock {
  delta: number
  duration: number
  isPlaying: boolean
  loop: boolean
  time: number
}

export interface RenderableLayerPass {
  asset: EditorAsset | null
  layer: EditorLayer
  params: LayerParameterValues
}

export interface RendererFrame {
  clock: ProjectClock
  layers: RenderableLayerPass[]
  logicalSize: Size
  outputSize: Size
  pixelRatio: number
  viewportSize: Size
}

export interface EditorRenderer {
  dispose(): void
  initialize(): Promise<void>
  render(frame: RendererFrame): void
  resize(size: Size, pixelRatio: number): void
}

type BuildRendererFrameInput = {
  assets: EditorAsset[]
  clockTime?: number
  delta: number
  layers: EditorLayer[]
  logicalSize?: Size
  outputSize: Size
  pixelRatio: number
  timeline: TimelineStateSnapshot
  viewportSize: Size
}

export function buildRendererFrame(input: BuildRendererFrameInput): RendererFrame {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const evaluatedLayers = evaluateTimelineForLayers(
    input.layers,
    input.timeline.tracks,
    input.timeline.currentTime,
  )
  const evaluatedById = new Map(evaluatedLayers.map((state) => [state.layerId, state]))

  const layers = input.layers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const evaluation = evaluatedById.get(layer.id)
      const params = cloneParameterValues(layer.params)

      if (evaluation) {
        Object.assign(params, evaluation.params)
      }

      return {
        asset: layer.assetId ? assetById.get(layer.assetId) ?? null : null,
        layer: {
          ...layer,
          hue:
            typeof evaluation?.properties.hue === "number"
              ? evaluation.properties.hue
              : layer.hue,
          opacity:
            typeof evaluation?.properties.opacity === "number"
              ? evaluation.properties.opacity
              : layer.opacity,
          saturation:
            typeof evaluation?.properties.saturation === "number"
              ? evaluation.properties.saturation
              : layer.saturation,
          visible:
            typeof evaluation?.properties.visible === "boolean"
              ? evaluation.properties.visible
              : layer.visible,
        },
        params,
      }
    })
    .filter((entry) => entry.layer.visible)

  return {
    clock: createProjectClock(input.timeline, input.delta, input.clockTime),
    layers,
    logicalSize: input.logicalSize ?? input.viewportSize,
    outputSize: input.outputSize,
    pixelRatio: input.pixelRatio,
    viewportSize: input.viewportSize,
  }
}
