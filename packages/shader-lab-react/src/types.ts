export type ShaderLabParameterValue =
  | number
  | string
  | boolean
  | [number, number]
  | [number, number, number]

export type ShaderLabLayerKind = "effect" | "source"

export type ShaderLabSourceLayerType =
  | "custom-shader"
  | "gradient"
  | "image"
  | "live"
  | "text"
  | "video"

export type ShaderLabEffectLayerType =
  | "ascii"
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

export type ShaderLabLayerType =
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
  asset?: ShaderLabAssetSource
  blendMode: ShaderLabBlendMode
  compositeMode: ShaderLabCompositeMode
  maskConfig?: ShaderLabMaskConfig
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
  composition: {
    height: number
    width: number
  }
  layers: ShaderLabLayerConfig[]
  timeline: ShaderLabTimelineConfig
}
