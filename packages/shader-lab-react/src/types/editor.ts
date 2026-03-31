import type { ShaderLabParameterValue } from "../types"

export type LayerParameterValues = Record<string, ShaderLabParameterValue>
export type LayerCompositeMode = "filter" | "mask"

export interface MaskConfig {
  contrast: number
  invert: boolean
  mode: string
  softness: number
  source: string
}

export const DEFAULT_MASK_CONFIG: MaskConfig = {
  contrast: 0,
  invert: false,
  mode: "multiply",
  softness: 0,
  source: "luminance",
}

