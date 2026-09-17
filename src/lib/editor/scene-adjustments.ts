import { areDefaultColorCurves } from "@/lib/color-curves"
import { DEFAULT_SCENE_CONFIG, type SceneConfig } from "@/types/editor"

const SCALAR_ADJUSTMENTS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "vibrance",
  "hue",
  "temperature",
  "tint",
  "invert",
  "clampMin",
  "clampMax",
  "clampGamma",
] as const satisfies readonly (keyof SceneConfig)[]

/** Grading only. Background, composition and preview quality are independent. */
export function neutralSceneAdjustments(): Partial<SceneConfig> {
  return structuredClone({
    ...Object.fromEntries(
      SCALAR_ADJUSTMENTS.map((key) => [key, DEFAULT_SCENE_CONFIG[key]])
    ),
    channelMixer: DEFAULT_SCENE_CONFIG.channelMixer,
    colorCurves: DEFAULT_SCENE_CONFIG.colorCurves,
    quantizeEnabled: false,
    quantizeLevels: DEFAULT_SCENE_CONFIG.quantizeLevels,
    colorMap: null,
  })
}

export function hasSceneAdjustments(config: SceneConfig): boolean {
  return (
    SCALAR_ADJUSTMENTS.some(
      (key) => config[key] !== DEFAULT_SCENE_CONFIG[key]
    ) ||
    Object.entries(DEFAULT_SCENE_CONFIG.channelMixer).some(
      ([key, value]) =>
        config.channelMixer[key as keyof SceneConfig["channelMixer"]] !== value
    ) ||
    !areDefaultColorCurves(config.colorCurves) ||
    config.quantizeEnabled ||
    config.colorMap !== null
  )
}
