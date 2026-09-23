export type ShaderLabParameterValue =
  | number
  | string
  | boolean
  | [number, number]
  | [number, number, number]

export type ShaderLabLayerKind = "effect" | "source" | "group"

export type ShaderLabSourceLayerType =
  | "custom-shader"
  | "fluid"
  | "gradient"
  | "image"
  | "live"
  | "magnify-lens"
  | "pixel-trail"
  | "shape"
  | "text"
  | "video"

export type ShaderLabEffectLayerType =
  | "photographic-cells"
  | "displaced-rings"
  | "annotations"
  | "ascii"
  | "blob-tracking"
  | "bloom"
  | "circuit-bent"
  | "directional-blur"
  | "chromatic-aberration"
  | "crt"
  | "displacement-map"
  | "dithering"
  | "edge-detect"
  | "fluted-glass"
  | "halftone"
  | "ink"
  | "particle-grid"
  | "pattern"
  | "pixelation"
  | "pixel-sorting"
  | "plotter"
  | "posterize"
  | "slice"
  | "smear"
  | "threshold"
  | "gradient-map"
  | "lumen-print"
  | "signal-rot"
  | "dot-grid"
  | "voxel"

export type ShaderLabLayerType =
  | "group"
  | ShaderLabEffectLayerType
  | ShaderLabSourceLayerType

export type ShaderLabBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"

export type ShaderLabCompositeMode = "filter" | "mask"

export type ShaderLabMaskSource =
  | "luminance"
  | "alpha"
  | "red"
  | "green"
  | "blue"
export type ShaderLabMaskMode = "multiply" | "stencil"

export interface ShaderLabMaskConfig {
  invert: boolean
  mode: ShaderLabMaskMode
  source: ShaderLabMaskSource
}

export type ShaderLabLayerMaskShape =
  | "none"
  | "depth"
  | "linear"
  | "radial"
  | "ellipse"
  | "rectangle"
  | "brush"
export type ShaderLabLayerMaskScope = "effect" | "content"

export interface ShaderLabLayerMask {
  shape: ShaderLabLayerMaskShape
  scope?: ShaderLabLayerMaskScope
  enabled?: boolean
  invert?: boolean
  center?: [number, number]
  size?: [number, number]
  rotation?: number
  feather?: number
  paint?: string
}

export type ShaderLabAssetSource =
  | {
      fileName?: string
      kind: "image"
      src: string
    }
  | {
      fileName?: string
      kind: "video"
      src: string
    }

export type ShaderLabInlineSketchSource = {
  code: string
  entryExport: string
  fileName?: string
  mode: "inline"
}

export type ShaderLabModuleSketchSource = {
  entryExport?: string
  mode: "module"
  sketch: unknown
}

export type ShaderLabSketchSource =
  | ShaderLabInlineSketchSource
  | ShaderLabModuleSketchSource

export type ShaderLabTimelineInterpolation = "linear" | "smooth" | "step"

export type ShaderLabCubicBezierPoints = [number, number, number, number]

export type ShaderLabKeyframeEasing =
  | { type: "bezier"; controlPoints: ShaderLabCubicBezierPoints }
  | { type: "step" }

export type ShaderLabAnimatedPropertyBinding =
  | {
      kind: "layer"
      label: string
      property: "hue" | "opacity" | "saturation" | "visible"
      valueType: "boolean" | "number"
    }
  | {
      key: string
      kind: "param"
      label: string
      valueType: "boolean" | "color" | "number" | "select" | "vec2" | "vec3"
    }

export interface ShaderLabTimelineKeyframe {
  easing?: ShaderLabKeyframeEasing
  id: string
  time: number
  value: ShaderLabParameterValue
}

export interface ShaderLabTimelineTrack {
  binding: ShaderLabAnimatedPropertyBinding
  enabled: boolean
  id: string
  /** @deprecated Use per-keyframe `easing` instead. */
  interpolation?: ShaderLabTimelineInterpolation
  keyframes: ShaderLabTimelineKeyframe[]
  layerId: string
}

export interface ShaderLabTimelineConfig {
  duration: number
  loop: boolean
  tracks: ShaderLabTimelineTrack[]
}

export interface ShaderLabLayerConfig {
  /** Parent group ID. Layers are stored in top-first, depth-first order. */
  parentId?: string | null
  asset?: ShaderLabAssetSource
  depthAsset?: Extract<ShaderLabAssetSource, { kind: "image" }>
  blendMode: ShaderLabBlendMode
  compositeMode: ShaderLabCompositeMode
  maskConfig?: ShaderLabMaskConfig
  mask?: ShaderLabLayerMask | null
  hue: number
  id: string
  kind: ShaderLabLayerKind
  name: string
  opacity: number
  params: Record<string, ShaderLabParameterValue>
  saturation: number
  sketch?: ShaderLabSketchSource
  type: ShaderLabLayerType
  visible: boolean
}

export interface ShaderLabConfig {
  composition?: {
    height: number
    width: number
  }
  layers: ShaderLabLayerConfig[]
  timeline: ShaderLabTimelineConfig
}
