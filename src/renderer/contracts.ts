import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  buildParameterValues,
  cloneParameterValues,
} from "@/lib/editor/parameter-schema"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { createProjectClock } from "@/renderer/project-clock"
import type {
  EditorAsset,
  EditorLayer,
  LayerDefinition,
  LayerParameterValues,
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
  startupPreviewDismissed?: boolean
  timeline: TimelineStateSnapshot
  viewportSize: Size
}

const STARTUP_PREVIEW_TEXT_LAYER_ID = "__startup-preview-text__"
const STARTUP_PREVIEW_INK_LAYER_ID = "__startup-preview-ink__"

function buildStartupPreviewLayer(
  definition: LayerDefinition,
  id: string
): EditorLayer {
  return {
    assetId: null,
    blendMode: "normal",
    compositeMode: "filter",
    expanded: true,
    hue: 0,
    id,
    kind: definition.kind,
    locked: false,
    name: definition.defaultName,
    opacity: 1,
    params: buildParameterValues(definition.params),
    runtimeError: null,
    saturation: 1,
    type: definition.type,
    visible: true,
  } as EditorLayer
}

function getStartupPreviewLayers(): EditorLayer[] {
  return [
    buildStartupPreviewLayer(
      getLayerDefinition("ink"),
      STARTUP_PREVIEW_INK_LAYER_ID
    ),
    buildStartupPreviewLayer(
      getLayerDefinition("text"),
      STARTUP_PREVIEW_TEXT_LAYER_ID
    ),
  ]
}

export function buildRendererFrame(
  input: BuildRendererFrameInput
): RendererFrame {
  const hasVisibleRealLayers = input.layers.some((layer) => layer.visible)
  const sourceLayers =
    !hasVisibleRealLayers && input.startupPreviewDismissed !== true
      ? getStartupPreviewLayers()
      : input.layers
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const evaluatedLayers = evaluateTimelineForLayers(
    sourceLayers,
    input.timeline.tracks,
    input.timeline.currentTime
  )
  const evaluatedById = new Map(
    evaluatedLayers.map((state) => [state.layerId, state])
  )

  const layers = sourceLayers
    .filter((layer) => layer.visible)
    .map((layer) => {
      const evaluation = evaluatedById.get(layer.id)
      const params = cloneParameterValues(layer.params)

      if (evaluation) {
        Object.assign(params, evaluation.params)
      }

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
    layers,
    logicalSize: input.logicalSize ?? input.viewportSize,
    outputSize: input.outputSize,
    pixelRatio: input.pixelRatio,
    viewportSize: input.viewportSize,
  }
}
