import type {
  EffectLayerType,
  LayerDefinition,
  LayerKind,
  LayerType,
  ModelLayerType,
  ParameterDefinitions,
  SourceLayerType,
} from "@/features/editor/types"

const imageParams = [
  {
    defaultValue: "cover",
    key: "fitMode",
    label: "Fit",
    options: [
      { label: "Cover", value: "cover" },
      { label: "Contain", value: "contain" },
      { label: "Stretch", value: "stretch" },
    ],
    type: "select",
  },
  {
    defaultValue: 1,
    key: "scale",
    label: "Scale",
    max: 4,
    min: 0.25,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: [0, 0] as [number, number],
    key: "offset",
    label: "Offset",
    max: 1,
    min: -1,
    step: 0.01,
    type: "vec2",
  },
] as const satisfies ParameterDefinitions

const videoParams = [
  ...imageParams,
  {
    defaultValue: true,
    key: "loop",
    label: "Loop",
    type: "boolean",
  },
  {
    defaultValue: 1,
    key: "playbackRate",
    label: "Playback Rate",
    max: 4,
    min: 0.25,
    step: 0.05,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const gradientParams = [
  {
    defaultValue: "linear",
    key: "style",
    label: "Style",
    options: [
      { label: "Linear", value: "linear" },
      { label: "Radial", value: "radial" },
      { label: "Mesh", value: "mesh" },
    ],
    type: "select",
  },
  {
    defaultValue: "#111418",
    key: "colorA",
    label: "Color A",
    type: "color",
  },
  {
    defaultValue: "#f4ede4",
    key: "colorB",
    label: "Color B",
    type: "color",
  },
  {
    defaultValue: 45,
    key: "angle",
    label: "Angle",
    max: 360,
    min: 0,
    step: 1,
    type: "number",
  },
  {
    defaultValue: 0.5,
    key: "balance",
    label: "Balance",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const fluidParams = [
  {
    defaultValue: 24,
    key: "iterations",
    label: "Iterations",
    max: 128,
    min: 4,
    step: 1,
    type: "number",
  },
  {
    defaultValue: 0.92,
    key: "dissipation",
    label: "Dissipation",
    max: 0.999,
    min: 0.5,
    step: 0.001,
    type: "number",
  },
  {
    defaultValue: 0.24,
    key: "pressure",
    label: "Pressure",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: "#3c73ff",
    key: "inkColor",
    label: "Ink Color",
    type: "color",
  },
] as const satisfies ParameterDefinitions

const modelParams = [
  {
    defaultValue: "studio",
    key: "environment",
    label: "Environment",
    options: [
      { label: "Studio", value: "studio" },
      { label: "Sunset", value: "sunset" },
      { label: "Warehouse", value: "warehouse" },
      { label: "Night", value: "night" },
    ],
    type: "select",
  },
  {
    defaultValue: 1,
    key: "environmentStrength",
    label: "Env Strength",
    max: 2,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: 1.2,
    key: "cameraDistance",
    label: "Camera Distance",
    max: 6,
    min: 0.2,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: [0, 0, 0] as [number, number, number],
    key: "cameraOrbit",
    label: "Camera Orbit",
    max: 6.283,
    min: -6.283,
    step: 0.01,
    type: "vec3",
  },
  {
    defaultValue: false,
    key: "autoRotate",
    label: "Auto Rotate",
    type: "boolean",
  },
  {
    defaultValue: 0.6,
    key: "autoRotateSpeed",
    label: "Rotate Speed",
    max: 4,
    min: -4,
    step: 0.01,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const asciiParams = [
  {
    defaultValue: 10,
    key: "cellSize",
    label: "Cell Size",
    max: 48,
    min: 4,
    step: 1,
    type: "number",
  },
  {
    animatable: false,
    defaultValue: "@#S%?*+;:,. ",
    key: "charset",
    label: "Charset",
    maxLength: 32,
    type: "text",
  },
  {
    defaultValue: "source",
    key: "colorMode",
    label: "Color Mode",
    options: [
      { label: "Source", value: "source" },
      { label: "Monochrome", value: "monochrome" },
    ],
    type: "select",
  },
  {
    defaultValue: "#f5f5f0",
    key: "foregroundColor",
    label: "Foreground",
    type: "color",
  },
  {
    defaultValue: "#0b0d10",
    key: "backgroundColor",
    label: "Background",
    type: "color",
  },
  {
    defaultValue: false,
    group: "Bloom",
    key: "bloomEnabled",
    label: "Bloom",
    type: "boolean",
  },
  {
    defaultValue: 0.6,
    group: "Bloom",
    key: "bloomIntensity",
    label: "Bloom Intensity",
    max: 2,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: 0.2,
    group: "Bloom",
    key: "bloomThreshold",
    label: "Bloom Threshold",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const ditheringParams = [
  {
    defaultValue: "bayer-4x4",
    key: "algorithm",
    label: "Algorithm",
    options: [
      { label: "Bayer 4x4", value: "bayer-4x4" },
      { label: "Bayer 8x8", value: "bayer-8x8" },
      { label: "Blue Noise", value: "blue-noise" },
    ],
    type: "select",
  },
  {
    defaultValue: 0.5,
    key: "spread",
    label: "Spread",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: 4,
    key: "levels",
    label: "Levels",
    max: 16,
    min: 2,
    step: 1,
    type: "number",
  },
  {
    defaultValue: "#f5f5f0",
    key: "color",
    label: "Tint",
    type: "color",
  },
] as const satisfies ParameterDefinitions

const halftoneParams = [
  {
    defaultValue: "circle",
    key: "shape",
    label: "Shape",
    options: [
      { label: "Circle", value: "circle" },
      { label: "Square", value: "square" },
      { label: "Diamond", value: "diamond" },
      { label: "Line", value: "line" },
    ],
    type: "select",
  },
  {
    defaultValue: 12,
    key: "spacing",
    label: "Spacing",
    max: 48,
    min: 2,
    step: 1,
    type: "number",
  },
  {
    defaultValue: 28,
    key: "angle",
    label: "Angle",
    max: 360,
    min: 0,
    step: 1,
    type: "number",
  },
  {
    defaultValue: 1,
    key: "contrast",
    label: "Contrast",
    max: 2,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: 0.25,
    key: "softness",
    label: "Softness",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: "#0d1014",
    key: "ink",
    label: "Ink",
    type: "color",
  },
] as const satisfies ParameterDefinitions

const pixelationParams = [
  {
    defaultValue: 8,
    key: "cellSize",
    label: "Cell Size",
    max: 64,
    min: 2,
    step: 1,
    type: "number",
  },
  {
    defaultValue: "square",
    key: "shape",
    label: "Shape",
    options: [
      { label: "Square", value: "square" },
      { label: "Circle", value: "circle" },
      { label: "Diamond", value: "diamond" },
    ],
    type: "select",
  },
] as const satisfies ParameterDefinitions

const pixelSortingParams = [
  {
    defaultValue: 0.55,
    key: "threshold",
    label: "Threshold",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
  {
    defaultValue: "horizontal",
    key: "direction",
    label: "Direction",
    options: [
      { label: "Horizontal", value: "horizontal" },
      { label: "Vertical", value: "vertical" },
    ],
    type: "select",
  },
  {
    defaultValue: "luma",
    key: "mode",
    label: "Mode",
    options: [
      { label: "Luma", value: "luma" },
      { label: "Hue", value: "hue" },
      { label: "Saturation", value: "saturation" },
    ],
    type: "select",
  },
  {
    defaultValue: 0.5,
    key: "range",
    label: "Range",
    max: 1,
    min: 0,
    step: 0.01,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const blurParams = [
  {
    defaultValue: 8,
    key: "radius",
    label: "Radius",
    max: 64,
    min: 0,
    step: 1,
    type: "number",
  },
  {
    defaultValue: 2,
    key: "passes",
    label: "Passes",
    max: 8,
    min: 1,
    step: 1,
    type: "number",
  },
] as const satisfies ParameterDefinitions

const layerDefinitions: Record<LayerType, LayerDefinition> = {
  ascii: {
    defaultName: "ASCII",
    kind: "effect",
    params: asciiParams,
    type: "ascii",
  },
  blur: {
    defaultName: "Blur",
    kind: "effect",
    params: blurParams,
    type: "blur",
  },
  dithering: {
    defaultName: "Dithering",
    kind: "effect",
    params: ditheringParams,
    type: "dithering",
  },
  fluid: {
    defaultName: "Fluid",
    kind: "source",
    params: fluidParams,
    type: "fluid",
  },
  gradient: {
    defaultName: "Gradient",
    kind: "source",
    params: gradientParams,
    type: "gradient",
  },
  halftone: {
    defaultName: "Halftone",
    kind: "effect",
    params: halftoneParams,
    type: "halftone",
  },
  image: {
    assetKind: "image",
    defaultName: "Image",
    kind: "source",
    params: imageParams,
    type: "image",
  },
  model: {
    assetKind: "model",
    defaultName: "3D Model",
    kind: "model",
    params: modelParams,
    type: "model",
  },
  "pixel-sorting": {
    defaultName: "Pixel Sorting",
    kind: "effect",
    params: pixelSortingParams,
    type: "pixel-sorting",
  },
  pixelation: {
    defaultName: "Pixelation",
    kind: "effect",
    params: pixelationParams,
    type: "pixelation",
  },
  video: {
    assetKind: "video",
    defaultName: "Video",
    kind: "source",
    params: videoParams,
    type: "video",
  },
}

export const DEFAULT_SOURCE_LAYER_TYPE: SourceLayerType = "gradient"
export const DEFAULT_EFFECT_LAYER_TYPE: EffectLayerType = "ascii"
export const DEFAULT_MODEL_LAYER_TYPE: ModelLayerType = "model"

export function getLayerDefinition(type: LayerType): LayerDefinition {
  return layerDefinitions[type]
}

export function getLayerDefinitions(): LayerDefinition[] {
  return Object.values(layerDefinitions)
}

export function getLayerDefinitionsByKind(kind: LayerKind): LayerDefinition[] {
  return getLayerDefinitions().filter((definition) => definition.kind === kind)
}
