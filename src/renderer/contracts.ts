import { cloneParameterValues } from "@/lib/editor/parameter-schema"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { createProjectClock } from "@/renderer/project-clock"
import type {
  EditorAsset,
  EditorLayer,
  LayerParameterValues,
  SceneConfig,
  Size,
  TimelineStateSnapshot,
} from "@/types/editor"

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
  cropAspectRatio: number | null
  layers: RenderableLayerPass[]
  logicalSize: Size
  outputSize: Size
  pixelRatio: number
  sceneConfig: SceneConfig
  viewportSize: Size
}

export interface EditorRenderer {
  dispose(): void
  exportFrame(frame: RendererFrame, renderSize: Size): HTMLCanvasElement
  hasPendingCompilations(): boolean
  hasPendingResources(): boolean
  initialize(): Promise<void>
  prepareForExportFrame(time: number, loop: boolean): Promise<void>
  render(frame: RendererFrame): void
  resize(size: Size, pixelRatio: number): void
  setPreviewFrozen(frozen: boolean): void
}

type BuildRendererFrameInput = {
  assets: EditorAsset[]
  clockTime?: number
  cropAspectRatio?: number | null
  delta: number
  layers: EditorLayer[]
  logicalSize?: Size
  outputSize: Size
  pixelRatio: number
  sceneConfig: SceneConfig
  timeline: TimelineStateSnapshot
  viewportSize: Size
}

const paramsCloneCache = new WeakMap<
  LayerParameterValues,
  LayerParameterValues
>()

function getCachedClone(params: LayerParameterValues): LayerParameterValues {
  let cached = paramsCloneCache.get(params)
  if (!cached) {
    cached = cloneParameterValues(params)
    paramsCloneCache.set(params, cached)
  }
  return cached
}

export function buildRendererFrame(
  input: BuildRendererFrameInput
): RendererFrame {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const evaluatedLayers = evaluateTimelineForLayers(
    input.layers,
    input.timeline.tracks,
    input.timeline.currentTime
  )
  const evaluatedById = new Map(
    evaluatedLayers.map((state) => [state.layerId, state])
  )

  const layers = input.layers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const evaluation = evaluatedById.get(layer.id)
      const params = evaluation
        ? { ...getCachedClone(layer.params), ...evaluation.params }
        : getCachedClone(layer.params)

      return {
        asset: layer.assetId ? (assetById.get(layer.assetId) ?? null) : null,
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
    cropAspectRatio: input.cropAspectRatio ?? null,
    layers,
    logicalSize: input.logicalSize ?? input.viewportSize,
    outputSize: input.outputSize,
    pixelRatio: input.pixelRatio,
    sceneConfig: input.sceneConfig,
    viewportSize: input.viewportSize,
  }
}
