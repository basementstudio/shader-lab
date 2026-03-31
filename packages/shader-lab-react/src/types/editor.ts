import type { ShaderLabParameterValue } from "../types"

export type LayerParameterValues = Record<string, ShaderLabParameterValue>
export type LayerCompositeMode = "filter" | "mask"

export interface MaskConfig {
  invert: boolean
  mode: string
  source: string
}

export const DEFAULT_MASK_CONFIG: MaskConfig = {
  invert: false,
  mode: "multiply",
  source: "luminance",
}

