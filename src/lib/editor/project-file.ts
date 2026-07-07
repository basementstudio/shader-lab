import { z } from "zod"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { createDefaultColorCurves } from "@/lib/color-curves"
import {
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
} from "@/lib/editor/custom-shader/shared"
import type {
  EditorAsset,
  EditorLayer,
  ProjectPresetConfig,
  SceneConfig,
  Size,
} from "@/types/editor"
import {
  BLEND_MODES,
  DEFAULT_SCENE_CONFIG,
  EFFECT_LAYER_TYPES,
  LAYER_COMPOSITE_MODES,
  MASK_MODES,
  MASK_SOURCES,
  SOURCE_LAYER_TYPES,
} from "@/types/editor"

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

// Fields shared by every layer kind. Later additions to `BaseLayer`
// (e.g. `maskConfig`) stay optional so legacy `.lab` files keep importing.
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
  fileName: z.string(),
  id: z.string(),
  kind: z.string(),
})

const labProjectFileSchema = z.looseObject({
  assets: z.array(assetReferenceSchema),
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
  version: z.union([z.literal(1), z.literal(2)]),
})

// Checked in order; the first rule matching any issue path wins so the
// user-facing wording stays identical to the pre-zod manual checks.
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
]

function toParseError(issues: readonly z.core.$ZodIssue[]): Error {
  for (const rule of PARSE_ISSUE_MESSAGES) {
    if (issues.some((issue) => rule.matches(issue.path))) {
      return new Error(rule.message)
    }
  }

  return new Error("The selected file is not a valid Shader Lab project.")
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

  const result = labProjectFileSchema.safeParse(parsed)

  if (!result.success) {
    throw toParseError(result.error.issues)
  }

  return structuredClone(result.data) as unknown as LabProjectFile
}

const CUSTOM_SHADER_STARTER_SOURCES = new Set<string>([
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
])

/**
 * Whether the project ships custom-shader source that differs from the
 * built-in starters — i.e. code authored elsewhere that would execute in the
 * importer's browser and should require explicit consent first.
 */
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
