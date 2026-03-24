export type ShaderLabParameterValue =
  | number
  | string
  | boolean
  | [number, number]
  | [number, number, number]

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
  id: string
  time: number
  value: ShaderLabParameterValue
}

export interface ShaderLabTimelineTrack {
  binding: ShaderLabAnimatedPropertyBinding
  enabled: boolean
  id: string
  interpolation: ShaderLabTimelineInterpolation
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
  blendMode: string
  compositeMode: string
  hue: number
  id: string
  kind: string
  name: string
  opacity: number
  params: Record<string, ShaderLabParameterValue>
  saturation: number
  sketch?: ShaderLabSketchSource
  type: string
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
