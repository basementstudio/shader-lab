import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { createDefaultColorCurves } from "@/lib/color-curves"
import type {
  EditorAsset,
  EditorLayer,
  ProjectPresetConfig,
  SceneConfig,
  Size,
} from "@/types/editor"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

export interface LabProjectFile extends ProjectPresetConfig {
  composition: Size
  format: "shader-lab"
  sceneConfig?: SceneConfig
}

export function buildLabProjectFile(): LabProjectFile {
  const assets = useAssetStore.getState().assets
  const editorState = useEditorStore.getState()
  const layerState = useLayerStore.getState()
  const timelineState = useTimelineStore.getState()

  return {
    assets: assets.map((asset) => ({
      fileName: asset.fileName,
      id: asset.id,
      kind: asset.kind,
    })),
    composition: structuredClone(editorState.outputSize),
    exportedAt: new Date().toISOString(),
    format: "shader-lab",
    layers: structuredClone(layerState.layers),
    sceneConfig: structuredClone(editorState.sceneConfig),
    selectedLayerId: layerState.selectedLayerId,
    timeline: structuredClone({
      duration: timelineState.duration,
      loop: timelineState.loop,
      tracks: timelineState.tracks,
    }),
    version: 2,
  }
}

export function parseLabProjectFile(input: string): LabProjectFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error("The selected file is not valid JSON.")
  }

  if (!(parsed && typeof parsed === "object")) {
    throw new Error("The selected file is not a valid Shader Lab project.")
  }

  const candidate = parsed as Partial<LabProjectFile>

  if (candidate.format !== "shader-lab") {
    throw new Error("This file is not a Shader Lab `.lab` project.")
  }

  if (!(candidate.version === 1 || candidate.version === 2)) {
    throw new Error("Unsupported Shader Lab project version.")
  }

  if (!Array.isArray(candidate.layers)) {
    throw new Error("Project file is missing a valid layer stack.")
  }

  if (!(candidate.timeline && typeof candidate.timeline === "object")) {
    throw new Error("Project file is missing timeline data.")
  }

  if (!Array.isArray(candidate.timeline.tracks)) {
    throw new Error("Project file is missing valid timeline tracks.")
  }

  if (
    !(candidate.composition && typeof candidate.composition === "object") ||
    typeof candidate.composition.width !== "number" ||
    typeof candidate.composition.height !== "number"
  ) {
    throw new Error("Project file is missing composition dimensions.")
  }

  return structuredClone(candidate as LabProjectFile)
}

export function applyLabProjectFile(
  projectFile: LabProjectFile,
  currentAssets: EditorAsset[]
): { missingAssetCount: number } {
  const assetIds = new Set(currentAssets.map((asset) => asset.id))
  const assetRefById = new Map(
    projectFile.assets.map((asset) => [asset.id, asset])
  )

  const nextLayers = projectFile.layers.map((layer) =>
    hydrateImportedLayer(layer, assetIds, assetRefById)
  )

  const hasSelectedLayer = nextLayers.some(
    (layer) => layer.id === projectFile.selectedLayerId
  )

  useLayerStore
    .getState()
    .replaceState(
      nextLayers,
      hasSelectedLayer ? projectFile.selectedLayerId : null,
      null
    )

  useTimelineStore.getState().replaceState({
    currentTime: 0,
    duration: projectFile.timeline.duration,
    isPlaying: true,
    loop: projectFile.timeline.loop,
    selectedKeyframeId: null,
    selectedKeyframeIds: [],
    selectedTrackId: null,
    tracks: projectFile.timeline.tracks,
  })

  const editorStore = useEditorStore.getState()
  if (projectFile.version >= 2 && projectFile.sceneConfig) {
    editorStore.updateSceneConfig(
      normalizeSceneConfig(projectFile.sceneConfig as Partial<SceneConfig>)
    )
    editorStore.setOutputSize(
      projectFile.composition.width,
      projectFile.composition.height
    )
  } else {
    // Legacy v1 files stored the viewport-fitted crop in `composition`,
    // so importing that value as the real project composition poisons export.
    editorStore.updateSceneConfig(DEFAULT_SCENE_CONFIG)
  }

  return {
    missingAssetCount: nextLayers.filter((layer) =>
      Boolean(layer.assetId && layer.runtimeError)
    ).length,
  }
}

function normalizeSceneConfig(sceneConfig: Partial<SceneConfig>): SceneConfig {
  const defaultCurves = createDefaultColorCurves()
  const colorCurves = sceneConfig.colorCurves
  const quantizeEnabled =
    typeof sceneConfig.quantizeEnabled === "boolean"
      ? sceneConfig.quantizeEnabled
      : typeof sceneConfig.quantizeLevels === "number" &&
          sceneConfig.quantizeLevels !== DEFAULT_SCENE_CONFIG.quantizeLevels

  return {
    ...DEFAULT_SCENE_CONFIG,
    ...sceneConfig,
    channelMixer: {
      ...DEFAULT_SCENE_CONFIG.channelMixer,
      ...sceneConfig.channelMixer,
    },
    colorCurves: {
      ...defaultCurves,
      ...colorCurves,
    },
    quantizeEnabled,
  }
}

function hydrateImportedLayer(
  layer: EditorLayer,
  assetIds: Set<string>,
  assetRefById: Map<string, LabProjectFile["assets"][number]>
): EditorLayer {
  if (!(layer.assetId && !assetIds.has(layer.assetId))) {
    return {
      ...layer,
      runtimeError: layer.runtimeError ?? null,
    }
  }

  const assetRef = assetRefById.get(layer.assetId)

  return {
    ...layer,
    runtimeError: assetRef
      ? `Missing asset: ${assetRef.fileName}`
      : "Missing asset reference",
  }
}
