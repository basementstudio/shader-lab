import type {
  ShaderLabAssetSource,
  ShaderLabConfig,
  ShaderLabLayerConfig,
  ShaderLabParameterValue,
  ShaderLabSketchSource,
  ShaderLabTimelineTrack,
} from "@shader-lab/react"
import { CUSTOM_SHADER_INTERNAL_KEYS } from "@/features/editor/custom-shader/shared"
import type {
  EditorAsset,
  EditorLayer,
  LayerType,
  TimelineStateSnapshot,
} from "@/features/editor/types"

const SUPPORTED_SHADER_EXPORT_LAYER_TYPES = new Set<LayerType>([
  "image",
  "video",
  "gradient",
  "live",
  "custom-shader",
  "ascii",
  "crt",
  "dithering",
  "halftone",
  "particle-grid",
  "pixel-sorting",
] as const)

const UNSUPPORTED_SHADER_EXPORT_LAYER_TYPES = new Set<LayerType>([
  "fluid",
  "model",
  "pixelation",
  "blur",
] as const)

export interface ShaderExportValidationIssue {
  layerId?: string
  message: string
}

export interface BuildShaderExportConfigInput {
  assets: EditorAsset[]
  composition: {
    height: number
    width: number
  }
  layers: EditorLayer[]
  timeline: Pick<TimelineStateSnapshot, "duration" | "loop" | "tracks">
}

export function validateShaderExportSupport(
  layers: EditorLayer[],
  assets: EditorAsset[] = [],
): ShaderExportValidationIssue[] {
  const issues: ShaderExportValidationIssue[] = []
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))

  for (const layer of layers) {
    if (UNSUPPORTED_SHADER_EXPORT_LAYER_TYPES.has(layer.type)) {
      issues.push({
        layerId: layer.id,
        message: `Layer "${layer.name}" uses "${layer.type}", which is not supported by shader export yet.`,
      })
      continue
    }

    if (!SUPPORTED_SHADER_EXPORT_LAYER_TYPES.has(layer.type)) {
      issues.push({
        layerId: layer.id,
        message: `Layer "${layer.name}" uses unknown type "${layer.type}" and cannot be exported.`,
      })
    }

    if ((layer.type === "image" || layer.type === "video") && !layer.assetId) {
      issues.push({
        layerId: layer.id,
        message: `Layer "${layer.name}" requires a linked ${layer.type} asset before export.`,
      })
    }

    if (
      (layer.type === "image" || layer.type === "video") &&
      layer.assetId &&
      !assetById.has(layer.assetId)
    ) {
      issues.push({
        layerId: layer.id,
        message: `Layer "${layer.name}" references a missing ${layer.type} asset.`,
      })
    }

    if (
      layer.type === "custom-shader" &&
      (typeof layer.params.sourceCode !== "string" || !layer.params.sourceCode.trim())
    ) {
      issues.push({
        layerId: layer.id,
        message: `Layer "${layer.name}" requires custom shader source before export.`,
      })
    }
  }

  return issues
}

export function buildShaderExportConfig(
  input: BuildShaderExportConfigInput,
): ShaderLabConfig {
  const issues = validateShaderExportSupport(input.layers, input.assets)

  if (issues.length > 0) {
    throw new Error(issues[0]?.message ?? "Shader export is not supported.")
  }

  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))

  return {
    composition: {
      height: input.composition.height,
      width: input.composition.width,
    },
    layers: input.layers.map((layer) =>
      toShaderLabLayerConfig(layer, layer.assetId ? assetById.get(layer.assetId) ?? null : null),
    ),
    timeline: {
      duration: input.timeline.duration,
      loop: input.timeline.loop,
      tracks: structuredClone(input.timeline.tracks) as ShaderLabTimelineTrack[],
    },
  }
}

function toShaderLabLayerConfig(
  layer: EditorLayer,
  asset: EditorAsset | null,
): ShaderLabLayerConfig {
  const sketch = layer.type === "custom-shader" ? getSketchSource(layer) : undefined
  const assetSource = toShaderLabAssetSource(layer, asset)
  const baseLayer: ShaderLabLayerConfig = {
    blendMode: layer.blendMode,
    compositeMode: layer.compositeMode,
    hue: layer.hue,
    id: layer.id,
    kind: layer.kind,
    name: layer.name,
    opacity: layer.opacity,
    params: stripEditorOnlyParams(layer),
    saturation: layer.saturation,
    type: layer.type,
    visible: layer.visible,
  }

  if (assetSource) {
    baseLayer.asset = assetSource
  }

  if (sketch) {
    baseLayer.sketch = sketch
  }

  return baseLayer
}

function toShaderLabAssetSource(
  layer: EditorLayer,
  asset: EditorAsset | null,
): ShaderLabAssetSource | undefined {
  if (layer.type === "image") {
    const fileName = asset?.fileName || "image.png"

    return {
      ...(asset?.fileName ? { fileName: asset.fileName } : {}),
      kind: "image",
      src: buildAssetPlaceholderPath("image", fileName),
    }
  }

  if (layer.type === "video") {
    const fileName = asset?.fileName || "video.mp4"

    return {
      ...(asset?.fileName ? { fileName: asset.fileName } : {}),
      kind: "video",
      src: buildAssetPlaceholderPath("video", fileName),
    }
  }

  return undefined
}

function getSketchSource(layer: EditorLayer): ShaderLabSketchSource | undefined {
  const sourceCode =
    typeof layer.params.sourceCode === "string" ? layer.params.sourceCode : ""

  if (!sourceCode.trim()) {
    return undefined
  }

  const fileName =
    typeof layer.params.sourceFileName === "string" && layer.params.sourceFileName.trim()
      ? layer.params.sourceFileName.trim()
      : null

  return {
    code: sourceCode,
    entryExport:
      typeof layer.params.entryExport === "string" && layer.params.entryExport.trim()
        ? layer.params.entryExport.trim()
        : "sketch",
    mode: "inline",
    ...(fileName ? { fileName } : {}),
  }
}

function stripEditorOnlyParams(layer: EditorLayer): Record<string, ShaderLabParameterValue> {
  const params: Record<string, ShaderLabParameterValue> = {}

  for (const [key, value] of Object.entries(layer.params)) {
    if (layer.type === "custom-shader" && CUSTOM_SHADER_INTERNAL_KEYS.has(key)) {
      continue
    }

    params[key] = structuredClone(value) as ShaderLabParameterValue
  }

  return params
}

function buildAssetPlaceholderPath(
  kind: Extract<ShaderLabAssetSource["kind"], "image" | "video">,
  fileName: string,
): string {
  const sanitizedFileName = sanitizeAssetFileName(fileName)

  return `/replace/${kind}/${sanitizedFileName}`
}

function sanitizeAssetFileName(fileName: string): string {
  const trimmed = fileName.trim()

  if (!trimmed) {
    return "asset"
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-")
}
