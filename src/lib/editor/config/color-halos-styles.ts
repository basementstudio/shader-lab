import {
  canonicalGradientMapStops,
  DEFAULT_COLOR_HALOS_STOPS,
  type GradientMapStop,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues } from "@/types/editor"

export type ColorHalosStyleValues = {
  bands: number
  flare: number
  flareColor: string
  flareLength: number
  flareThreshold: number
  glowFrom: "alpha" | "dark" | "light"
  intensity: number
  keepShape: boolean
  reach: number
  spread: number
  threshold: number
}

export type ColorHalosStyle = {
  id: string
  label: string
  stops: GradientMapStop[]
  values: ColorHalosStyleValues
}

export const COLOR_HALOS_STYLES: ColorHalosStyle[] = [
  {
    id: "gradient-maps",
    label: "Gradient Maps",
    stops: DEFAULT_COLOR_HALOS_STOPS,
    values: {
      bands: 0,
      flare: 0,
      flareColor: "#ff7a3d",
      flareLength: 160,
      flareThreshold: 0.8,
      glowFrom: "dark",
      intensity: 1.6,
      keepShape: true,
      reach: 0.08,
      spread: 40,
      threshold: 0.5,
    },
  },
  {
    id: "aura",
    label: "Aura",
    stops: [
      { position: 0, color: "#6a3df0" },
      { position: 0.4, color: "#ff4fb3" },
      { position: 0.75, color: "#ffd34d" },
      { position: 1, color: "#fffbe8" },
    ],
    values: {
      bands: 0,
      flare: 0,
      flareColor: "#ffffff",
      flareLength: 160,
      flareThreshold: 0.8,
      glowFrom: "light",
      intensity: 1.4,
      keepShape: false,
      reach: 0.12,
      spread: 70,
      threshold: 0.6,
    },
  },
  {
    id: "cross-flare",
    label: "Cross Flare",
    stops: [
      { position: 0, color: "#bcd3e6" },
      { position: 0.6, color: "#7ea4c8" },
      { position: 1, color: "#3a5a7a" },
    ],
    values: {
      bands: 0,
      flare: 1,
      flareColor: "#ff7a3d",
      flareLength: 220,
      flareThreshold: 0.9,
      glowFrom: "dark",
      intensity: 1.2,
      keepShape: true,
      reach: 0.2,
      spread: 30,
      threshold: 0.5,
    },
  },
  {
    id: "contour-bands",
    label: "Contour Bands",
    stops: [
      { position: 0, color: "#1f2bff" },
      { position: 0.25, color: "#18d3c4" },
      { position: 0.5, color: "#c6f432" },
      { position: 0.75, color: "#ff9f1c" },
      { position: 1, color: "#ff1d58" },
    ],
    values: {
      bands: 7,
      flare: 0,
      flareColor: "#ff7a3d",
      flareLength: 160,
      flareThreshold: 0.8,
      glowFrom: "dark",
      intensity: 1.8,
      keepShape: true,
      reach: 0.04,
      spread: 55,
      threshold: 0.5,
    },
  },
]

export const DEFAULT_COLOR_HALOS_STYLE = COLOR_HALOS_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_COLOR_HALOS_STYLE.values
) as (keyof ColorHalosStyleValues)[]

export function matchColorHalosStyle(values: LayerParameterValues): string {
  const stops = canonicalGradientMapStops(parseGradientMapStops(values.stops))
  const match = COLOR_HALOS_STYLES.find(
    (style) =>
      canonicalGradientMapStops(style.stops) === stops &&
      STYLE_KEYS.every((key) => {
        const expected = style.values[key]
        const actual = values[key]
        if (typeof expected === "number")
          return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
        if (typeof expected === "boolean") return actual === expected
        return (
          typeof actual === "string" &&
          actual.toLowerCase() === expected.toLowerCase()
        )
      })
  )
  return match?.id ?? "custom"
}

export function colorHalosStyleParams(
  style: ColorHalosStyle
): LayerParameterValues {
  return { ...style.values, stops: serializeGradientMapStops(style.stops) }
}
