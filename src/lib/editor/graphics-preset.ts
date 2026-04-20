export type GraphicsPreset = "performance" | "balanced" | "quality"

export type GraphicsPresetMode = "auto" | GraphicsPreset

export interface GraphicsPresetSettings {
  pixelRatioCap: number
  renderScale: 1 | 0.75 | 0.5
  layerCaps?: Record<string, Record<string, number>>
}

export const GRAPHICS_PRESET_CONFIG: Record<
  GraphicsPreset,
  GraphicsPresetSettings
> = {
  performance: {
    pixelRatioCap: 1,
    renderScale: 0.5,
  },
  balanced: {
    pixelRatioCap: 1.5,
    renderScale: 0.75,
  },
  quality: {
    pixelRatioCap: 2,
    renderScale: 1,
  },
}

export const GRAPHICS_PRESET_LABELS: Record<GraphicsPreset, string> = {
  performance: "Performance",
  balanced: "Balanced",
  quality: "Quality",
}

export function resolveActivePreset(
  mode: GraphicsPresetMode,
  detected: GraphicsPreset | null
): GraphicsPreset {
  if (mode === "auto") {
    return detected ?? "balanced"
  }
  return mode
}

export function getPresetSettings(
  mode: GraphicsPresetMode,
  detected: GraphicsPreset | null
): GraphicsPresetSettings {
  return GRAPHICS_PRESET_CONFIG[resolveActivePreset(mode, detected)]
}
