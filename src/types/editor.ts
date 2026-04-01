export const LAYER_KINDS = ["source", "effect", "model"] as const
export type LayerKind = (typeof LAYER_KINDS)[number]

export const SOURCE_LAYER_TYPES = [
  "image",
  "video",
  "gradient",
  "text",
  "fluid",
  "live",
  "custom-shader",
] as const
export type SourceLayerType = (typeof SOURCE_LAYER_TYPES)[number]

export const EFFECT_LAYER_TYPES = [
  "ascii",
  "directional-blur",
  "fluted-glass",
  "ink",
  "pattern",
  "plotter",
  "posterize",
  "threshold",
  "crt",
  "dithering",
  "halftone",
  "particle-grid",
  "pixelation",
  "pixel-sorting",
  "slice",
  "smear",
  "blur",
  "edge-detect",
  "displacement-map",
  "chromatic-aberration",
] as const
export type EffectLayerType = (typeof EFFECT_LAYER_TYPES)[number]

export const MODEL_LAYER_TYPES = ["model"] as const
export type ModelLayerType = (typeof MODEL_LAYER_TYPES)[number]

export type LayerType = SourceLayerType | EffectLayerType | ModelLayerType

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const
export type BlendMode = (typeof BLEND_MODES)[number]

export const LAYER_COMPOSITE_MODES = ["filter", "mask"] as const
export type LayerCompositeMode = (typeof LAYER_COMPOSITE_MODES)[number]

export const MASK_SOURCES = [
  "luminance",
  "alpha",
  "red",
  "green",
  "blue",
] as const
export type MaskSource = (typeof MASK_SOURCES)[number]

export const MASK_MODES = ["multiply", "stencil"] as const
export type MaskMode = (typeof MASK_MODES)[number]

export interface MaskConfig {
  invert: boolean
  mode: MaskMode
  source: MaskSource
}

export const ASSET_KINDS = ["image", "video", "model"] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export type Vector2 = { x: number; y: number }
export type Size = { width: number; height: number }

export type ParameterValue =
  | number
  | string
  | boolean
  | [number, number]
  | [number, number, number]

export type ParameterType =
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "vec2"
  | "vec3"
  | "text"

export type ParameterVisibilityCondition = {
  key: string
} & (
  | {
      equals: boolean | number | string
    }
  | {
      gte: number
    }
)

type ParameterDefinitionBase<
  TType extends ParameterType,
  TValue extends ParameterValue,
> = {
  animatable?: boolean
  defaultValue: TValue
  description?: string
  group?: string
  key: string
  label: string
  type: TType
  visibleWhen?: ParameterVisibilityCondition
}

export type NumberParameterDefinition = ParameterDefinitionBase<
  "number",
  number
> & {
  input?: "float" | "int"
  max?: number
  min?: number
  step?: number
  unit?: string
}

export type BooleanParameterDefinition = ParameterDefinitionBase<
  "boolean",
  boolean
>

export type SelectParameterDefinition = ParameterDefinitionBase<
  "select",
  string
> & {
  options: readonly {
    label: string
    value: string
  }[]
}

export type ColorParameterDefinition = ParameterDefinitionBase<"color", string>

export type TextParameterDefinition = ParameterDefinitionBase<
  "text",
  string
> & {
  maxLength?: number
}

export type Vec2ParameterDefinition = ParameterDefinitionBase<
  "vec2",
  [number, number]
> & {
  max?: number
  min?: number
  step?: number
}

export type Vec3ParameterDefinition = ParameterDefinitionBase<
  "vec3",
  [number, number, number]
> & {
  max?: number
  min?: number
  step?: number
}

export type ParameterDefinition =
  | NumberParameterDefinition
  | BooleanParameterDefinition
  | SelectParameterDefinition
  | ColorParameterDefinition
  | TextParameterDefinition
  | Vec2ParameterDefinition
  | Vec3ParameterDefinition

export type ParameterDefinitions = readonly ParameterDefinition[]
export type LayerParameterValues = Record<string, ParameterValue>

export type LayerFrameAdjustment = {
  hue: number
  opacity: number
  saturation: number
}

export const DEFAULT_MASK_CONFIG: MaskConfig = {
  invert: false,
  mode: "multiply",
  source: "luminance",
}

export interface BaseLayer {
  assetId: string | null
  blendMode: BlendMode
  compositeMode: LayerCompositeMode
  expanded: boolean
  hue: number
  id: string
  kind: LayerKind
  locked: boolean
  maskConfig: MaskConfig
  name: string
  opacity: number
  params: LayerParameterValues
  runtimeError: string | null
  saturation: number
  type: LayerType
  visible: boolean
}

export interface SourceLayer extends BaseLayer {
  kind: "source"
  type: SourceLayerType
}

export interface EffectLayer extends BaseLayer {
  kind: "effect"
  type: EffectLayerType
}

export interface ModelLayer extends BaseLayer {
  kind: "model"
  type: "model"
}

export type EditorLayer = SourceLayer | EffectLayer | ModelLayer

export type AssetStatus = "idle" | "loading" | "ready" | "error"

export interface EditorAsset {
  createdAt: string
  duration: number | null
  error: string | null
  fileName: string
  id: string
  kind: AssetKind
  mimeType: string
  sizeBytes: number
  status: AssetStatus
  url: string
  width: number | null
  height: number | null
}

export const TIMELINE_INTERPOLATIONS = ["linear", "smooth", "step"] as const
export type TimelineInterpolation = (typeof TIMELINE_INTERPOLATIONS)[number]

export type LayerAnimatableProperty =
  | "opacity"
  | "hue"
  | "saturation"
  | "visible"
export type AnimatableValueType = Exclude<ParameterType, "text"> | "boolean"

export type AnimatedPropertyBinding =
  | {
      kind: "layer"
      label: string
      property: LayerAnimatableProperty
      valueType: "boolean" | "number"
    }
  | {
      key: string
      kind: "param"
      label: string
      valueType: AnimatableValueType
    }

export interface TimelineKeyframe {
  id: string
  time: number
  value: ParameterValue
}

export interface TimelineTrack {
  binding: AnimatedPropertyBinding
  enabled: boolean
  id: string
  interpolation: TimelineInterpolation
  keyframes: TimelineKeyframe[]
  layerId: string
}

export interface TimelineStateSnapshot {
  currentTime: number
  duration: number
  isPlaying: boolean
  loop: boolean
  selectedKeyframeId: string | null
  selectedTrackId: string | null
  tracks: TimelineTrack[]
}

export type SidebarView = "properties" | "scene"

export const COMPOSITION_ASPECTS = [
  "screen",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
  "custom",
] as const
export type CompositionAspect = (typeof COMPOSITION_ASPECTS)[number]

export interface SceneConfig {
  backgroundColor: string
  compositionAspect: CompositionAspect
  compositionWidth: number
  compositionHeight: number
  brightness: number
  contrast: number
  invert: boolean
  channelMixer: {
    rr: number
    rg: number
    rb: number
    gr: number
    gg: number
    gb: number
    br: number
    bg: number
    bb: number
  }
  clampMin: number
  clampMax: number
  quantizeLevels: number
  colorMap: { stops: { position: number; color: string }[] } | null
}

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  backgroundColor: "#080808",
  compositionAspect: "screen",
  compositionWidth: 1920,
  compositionHeight: 1080,
  brightness: 0,
  contrast: 0,
  invert: false,
  channelMixer: {
    rr: 1,
    rg: 0,
    rb: 0,
    gr: 0,
    gg: 1,
    gb: 0,
    br: 0,
    bg: 0,
    bb: 1,
  },
  clampMin: 0,
  clampMax: 1,
  quantizeLevels: 256,
  colorMap: null,
}

export type RenderScale = 1 | 0.75 | 0.5
export type WebGPUStatus =
  | "idle"
  | "unsupported"
  | "initializing"
  | "ready"
  | "error"

export interface EditorStateSnapshot {
  canvasSize: Size
  fps: number
  immersiveCanvas: boolean
  outputSize: Size
  panOffset: Vector2
  renderScale: RenderScale
  sceneConfig: SceneConfig
  sidebars: {
    left: boolean
    right: boolean
  }
  sidebarView: SidebarView
  theme: "dark" | "light"
  timelinePanelOpen: boolean
  webgpuError: string | null
  webgpuStatus: WebGPUStatus
  zoom: number
}

export interface EditorHistorySnapshot {
  hoveredLayerId: string | null
  layers: EditorLayer[]
  selectedLayerId: string | null
  timeline: Pick<
    TimelineStateSnapshot,
    | "currentTime"
    | "duration"
    | "loop"
    | "selectedKeyframeId"
    | "selectedTrackId"
    | "tracks"
  >
}

export interface HistoryEntry {
  id: string
  label: string
  snapshot: EditorHistorySnapshot
  timestamp: number
}

export interface ExportImageConfig {
  format: "png"
  size: Size
}

export interface ExportVideoConfig {
  duration: number
  format: "mp4" | "webm"
  fps: number
  size: Size
}

export interface PresetAssetReference {
  fileName: string
  id: string
  kind: AssetKind
}

export interface ProjectPresetConfig {
  assets: PresetAssetReference[]
  exportedAt: string
  layers: EditorLayer[]
  selectedLayerId: string | null
  timeline: Pick<TimelineStateSnapshot, "duration" | "loop" | "tracks">
  version: number
}

export interface LayerDefinition {
  assetKind?: AssetKind
  defaultName: string
  kind: LayerKind
  params: ParameterDefinitions
  type: LayerType
}
