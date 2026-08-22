import { z } from "zod"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { createDefaultColorCurves } from "@/lib/color-curves"
import {
  clampBandConfig,
  createDefaultAudioBands,
} from "@/lib/editor/audio/bands"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
} from "@/lib/editor/custom-shader/shared"
import { collectRemoteAssets } from "@/lib/editor/remote-asset"
import type {
  EditorAsset,
  EditorAudioSnapshot,
  EditorLayer,
  LayerParameterValues,
  PresetAssetReference,
  ProjectPresetConfig,
  SceneConfig,
  Size,
} from "@/types/editor"
import {
  AUDIO_BAND_IDS,
  BLEND_MODES,
  DEFAULT_SCENE_CONFIG,
  EFFECT_LAYER_TYPES,
  LAYER_COMPOSITE_MODES,
  MASK_MODES,
  MASK_SOURCES,
  SOURCE_LAYER_TYPES,
} from "@/types/editor"

export interface LabProjectFile extends ProjectPresetConfig {
  audio?: EditorAudioSnapshot
  composition: Size
  format: "shader-lab"
  sceneConfig?: SceneConfig
}

function toAssetReference(asset: EditorAsset): PresetAssetReference {
  const reference: PresetAssetReference = {
    fileName: asset.fileName,
    id: asset.id,
    kind: asset.kind,
  }

  if (asset.source !== "remote") {
    return reference
  }

  return {
    ...reference,
    duration: asset.duration,
    height: asset.height,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url: asset.url,
    width: asset.width,
  }
}

export function collectReferencedAssetIds(input: {
  audioSource: EditorAudioSnapshot["source"]
  layers: readonly EditorLayer[]
}): Set<string> {
  const referenced = new Set<string>()

  for (const layer of input.layers) {
    if (layer.assetId) {
      referenced.add(layer.assetId)
    }
  }

  if (input.audioSource?.kind === "asset") {
    referenced.add(input.audioSource.assetId)
  }

  return referenced
}

export function buildPublishableProjectFile(
  file: LabProjectFile
): LabProjectFile {
  const audioSource = file.audio?.source ?? null
  const audioLayerId =
    audioSource?.kind === "video-layer" ? audioSource.layerId : null
  const layers = file.layers.filter(
    (layer) => layer.visible || layer.id === audioLayerId
  )

  if (layers.length === file.layers.length) {
    return file
  }

  const keptIds = new Set(layers.map((layer) => layer.id))
  const referenced = collectReferencedAssetIds({ audioSource, layers })

  return {
    ...file,
    assets: file.assets.filter((asset) => referenced.has(asset.id)),
    ...(file.audio
      ? {
          audio: {
            ...file.audio,
            links: file.audio.links.filter((link) => keptIds.has(link.layerId)),
          },
        }
      : {}),
    layers,
    selectedLayerId:
      file.selectedLayerId && keptIds.has(file.selectedLayerId)
        ? file.selectedLayerId
        : null,
    timeline: {
      ...file.timeline,
      tracks: file.timeline.tracks.filter((track) => keptIds.has(track.layerId)),
    },
  }
}

export function buildLabProjectFile(): LabProjectFile {
  const assets = useAssetStore.getState().assets
  const editorState = useEditorStore.getState()
  const layerState = useLayerStore.getState()
  const timelineState = useTimelineStore.getState()
  const audio = structuredClone(useAudioStore.getState().getSnapshot())
  const referenced = collectReferencedAssetIds({
    audioSource: audio.source,
    layers: layerState.layers,
  })

  return {
    assets: assets
      .filter((asset) => referenced.has(asset.id))
      .map(toAssetReference),
    audio,
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
    version: CURRENT_PROJECT_FILE_VERSION,
  }
}

function normalizeProjectAudio(audio: unknown): EditorAudioSnapshot {
  const defaults: EditorAudioSnapshot = {
    bands: createDefaultAudioBands(),
    links: [],
    offsetSeconds: 0,
    source: null,
  }

  if (!audio || typeof audio !== "object") {
    return defaults
  }

  const candidate = audio as Partial<EditorAudioSnapshot>
  const bands = createDefaultAudioBands()

  if (candidate.bands && typeof candidate.bands === "object") {
    for (const bandId of AUDIO_BAND_IDS) {
      const persisted = candidate.bands[bandId]

      if (persisted) {
        bands[bandId] = clampBandConfig({ ...bands[bandId], ...persisted })
      }
    }
  }

  const links = Array.isArray(candidate.links)
    ? candidate.links
        .filter(
          (link) =>
            typeof link?.id === "string" &&
            typeof link?.layerId === "string" &&
            AUDIO_BAND_IDS.includes(link.band) &&
            typeof link?.outMin === "number" &&
            typeof link?.outMax === "number"
        )
        .map((link) => ({ ...link, enabled: link.enabled !== false }))
    : []

  return {
    bands,
    links,
    offsetSeconds:
      typeof candidate.offsetSeconds === "number" &&
      Number.isFinite(candidate.offsetSeconds)
        ? candidate.offsetSeconds
        : 0,
    source: candidate.source ?? null,
  }
}

const parameterValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
])

const maskConfigSchema = z.looseObject({
  invert: z.boolean(),
  mode: z.enum(MASK_MODES),
  source: z.enum(MASK_SOURCES),
})

const baseLayerShape = {
  assetId: z.string().nullable(),
  blendMode: z.enum(BLEND_MODES),
  compositeMode: z.enum(LAYER_COMPOSITE_MODES),
  expanded: z.boolean(),
  fluidInteractionEvents: z.array(z.looseObject({})).optional(),
  hue: z.number(),
  id: z.string(),
  locked: z.boolean(),
  maskConfig: maskConfigSchema.optional(),
  name: z.string(),
  opacity: z.number(),
  params: z.record(z.string(), parameterValueSchema),
  runtimeError: z.string().nullable().optional(),
  saturation: z.number(),
  visible: z.boolean(),
}

const layerSchema = z.discriminatedUnion("kind", [
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("effect"),
    type: z.enum(EFFECT_LAYER_TYPES),
  }),
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("model"),
    type: z.literal("model"),
  }),
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("source"),
    type: z.enum(SOURCE_LAYER_TYPES),
  }),
])

const timelineKeyframeSchema = z.looseObject({
  id: z.string(),
  time: z.number(),
  value: parameterValueSchema,
})

const timelineTrackSchema = z.looseObject({
  binding: z.looseObject({}),
  enabled: z.boolean(),
  id: z.string(),
  keyframes: z.array(timelineKeyframeSchema),
  layerId: z.string(),
})

const assetReferenceSchema = z.looseObject({
  duration: z.number().nullable().optional(),
  fileName: z.string(),
  height: z.number().nullable().optional(),
  id: z.string(),
  kind: z.string(),
  mimeType: z.string().optional(),
  sha256: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  width: z.number().nullable().optional(),
})

const audioBandConfigSchema = z.looseObject({
  attackMs: z.number(),
  gainDb: z.number(),
  highHz: z.number(),
  lowHz: z.number(),
  releaseMs: z.number(),
})

const audioLinkSchema = z.looseObject({
  band: z.string(),
  binding: z.looseObject({}),
  enabled: z.boolean().optional(),
  id: z.string(),
  layerId: z.string(),
  outMax: z.number(),
  outMin: z.number(),
})

const projectAudioSchema = z.looseObject({
  bands: z.record(z.string(), audioBandConfigSchema).optional(),
  links: z.array(audioLinkSchema).optional(),
  offsetSeconds: z.number().optional(),
  source: z.looseObject({ kind: z.string() }).nullable().optional(),
})

export const CURRENT_PROJECT_FILE_VERSION = 6

const labProjectFileSchema = z.looseObject({
  assets: z.array(assetReferenceSchema),
  audio: projectAudioSchema.optional(),
  composition: z.looseObject({
    height: z.number().positive(),
    width: z.number().positive(),
  }),
  exportedAt: z.string().optional(),
  format: z.literal("shader-lab"),
  layers: z.array(layerSchema),
  sceneConfig: z.looseObject({}).optional(),
  selectedLayerId: z.string().nullable().optional(),
  timeline: z.looseObject({
    duration: z.number(),
    loop: z.boolean(),
    tracks: z.array(timelineTrackSchema),
  }),
  version: z.number().int().positive().max(CURRENT_PROJECT_FILE_VERSION),
})

const PARSE_ISSUE_MESSAGES: {
  matches: (path: readonly PropertyKey[]) => boolean
  message: string
}[] = [
  {
    matches: (path) => path[0] === "format",
    message: "This file is not a Shader Lab `.lab` project.",
  },
  {
    matches: (path) => path[0] === "version",
    message: "Unsupported Shader Lab project version.",
  },
  {
    matches: (path) => path[0] === "layers",
    message: "Project file is missing a valid layer stack.",
  },
  {
    matches: (path) => path[0] === "timeline" && path[1] === "tracks",
    message: "Project file is missing valid timeline tracks.",
  },
  {
    matches: (path) => path[0] === "timeline",
    message: "Project file is missing timeline data.",
  },
  {
    matches: (path) => path[0] === "composition",
    message: "Project file is missing composition dimensions.",
  },
  {
    matches: (path) => path[0] === "audio",
    message: "Project file has an unreadable audio configuration.",
  },
  {
    matches: (path) => path[0] === "assets",
    message: "Project file has an unreadable asset list.",
  },
]

function toParseError(issues: readonly z.core.$ZodIssue[]): Error {
  for (const rule of PARSE_ISSUE_MESSAGES) {
    if (issues.some((issue) => rule.matches(issue.path))) {
      return new Error(rule.message)
    }
  }

  return new Error("The selected file is not a valid Shader Lab project.")
}

export function parseLabProjectFileValue(parsed: unknown): LabProjectFile {
  if (!(parsed && typeof parsed === "object")) {
    throw new Error("The selected file is not a valid Shader Lab project.")
  }

  const result = labProjectFileSchema.safeParse(parsed)

  if (!result.success) {
    throw toParseError(result.error.issues)
  }

  return structuredClone(result.data) as unknown as LabProjectFile
}

export function parseLabProjectFile(input: string): LabProjectFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error("The selected file is not valid JSON.")
  }

  return parseLabProjectFileValue(parsed)
}

const CUSTOM_SHADER_STARTER_SOURCES = new Set<string>([
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
])

export function hasImportedCustomShaderCode(
  projectFile: LabProjectFile
): boolean {
  return projectFile.layers.some((layer) => {
    if (layer.type !== "custom-shader") {
      return false
    }

    const sourceCode = layer.params.sourceCode

    return (
      typeof sourceCode === "string" &&
      sourceCode.trim().length > 0 &&
      !CUSTOM_SHADER_STARTER_SOURCES.has(sourceCode)
    )
  })
}

function isAudioSourceResolvable(
  source: EditorAudioSnapshot["source"],
  assetIds: Set<string>,
  layers: EditorLayer[]
): boolean {
  if (!source) {
    return true
  }

  if (source.kind === "asset") {
    return assetIds.has(source.assetId)
  }

  return layers.some((layer) => layer.id === source.layerId)
}

export function applyLabProjectFile(
  projectFile: LabProjectFile,
  currentAssets: EditorAsset[]
): { missingAssetCount: number; missingAudioSource: boolean } {
  const existingIds = new Set(currentAssets.map((asset) => asset.id))
  const remoteAssets = collectRemoteAssets(projectFile.assets, existingIds)

  if (remoteAssets.length > 0) {
    useAssetStore
      .getState()
      .replaceAssets([...currentAssets, ...remoteAssets])
  }

  const assetIds = new Set([
    ...existingIds,
    ...remoteAssets.map((asset) => asset.id),
  ])
  const assetRefById = new Map(
    projectFile.assets.map((asset) => [asset.id, asset])
  )

  const nextLayers = projectFile.layers.map((layer) =>
    hydrateImportedLayer(layer, assetIds, assetRefById, projectFile.version)
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

  useTimelineStore.getState().pruneTracks(nextLayers)

  const audioSnapshot = normalizeProjectAudio(projectFile.audio)
  useAudioStore.getState().replaceState(audioSnapshot)

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
    editorStore.updateSceneConfig(DEFAULT_SCENE_CONFIG)
  }

  editorStore.noteSceneReplaced()

  return {
    missingAssetCount: nextLayers.filter((layer) =>
      Boolean(layer.assetId && layer.runtimeError)
    ).length,
    missingAudioSource: !isAudioSourceResolvable(
      audioSnapshot.source,
      assetIds,
      nextLayers
    ),
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

const LEGACY_ASCII_FONT_WEIGHTS: Record<string, number> = {
  bold: 700,
  regular: 400,
  thin: 100,
}

export function migrateLayerParams(
  layer: EditorLayer,
  version: number
): LayerParameterValues {
  const params: LayerParameterValues = { ...layer.params }

  if (layer.type === "ascii" && typeof params.fontWeight === "string") {
    params.fontWeight = LEGACY_ASCII_FONT_WEIGHTS[params.fontWeight] ?? 400
  }

  // v6 flipped blob-tracking `sensitivity` so higher means more sensitive;
  // before that it was fed straight in as a luma threshold. The flip landed on
  // main as v5 while this branch had already published scenes stamped 5 for an
  // unrelated change, so it has to reach those too.
  if (
    version < 6 &&
    layer.type === "blob-tracking" &&
    typeof params.sensitivity === "number"
  ) {
    params.sensitivity = 1 - params.sensitivity
  }

  for (const parameter of getLayerDefinition(layer.type).params) {
    if (params[parameter.key] === undefined) {
      params[parameter.key] = parameter.defaultValue
    }
  }

  return params
}

function hydrateImportedLayer(
  layer: EditorLayer,
  assetIds: Set<string>,
  assetRefById: Map<string, LabProjectFile["assets"][number]>,
  version: number
): EditorLayer {
  const params = migrateLayerParams(layer, version)

  if (!(layer.assetId && !assetIds.has(layer.assetId))) {
    return {
      ...layer,
      params,
      runtimeError: layer.runtimeError ?? null,
    }
  }

  const assetRef = assetRefById.get(layer.assetId)

  return {
    ...layer,
    params,
    runtimeError: assetRef
      ? `Missing asset: ${assetRef.fileName}`
      : "Missing asset reference",
  }
}
