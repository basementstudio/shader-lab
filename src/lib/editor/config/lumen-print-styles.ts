import {
  canonicalGradientMapStops,
  DEFAULT_LUMEN_PRINT_STOPS,
  type GradientMapStop,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues } from "@/types/editor"

export type LumenPrintStyleValues = {
  contrast: number
  diffusion: number
  edgeBurn: number
  edgeLines: number
  exposure: number
  grain: number
  grainSize: number
  halation: number
  pivot: number
  radius: number
  ragged: number
  solarize: number
  washout: number
}

export type LumenPrintStyle = {
  id: string
  label: string
  stops: GradientMapStop[]
  values: LumenPrintStyleValues
}

export const LUMEN_PRINT_STYLES: LumenPrintStyle[] = [
  {
    id: "lumen",
    label: "Lumen",
    stops: DEFAULT_LUMEN_PRINT_STOPS,
    values: {
      contrast: 1.15,
      diffusion: 0.15,
      edgeBurn: 0.35,
      edgeLines: 0,
      exposure: 0,
      grain: 0.2,
      grainSize: 1.5,
      halation: 0.3,
      pivot: 0.8,
      radius: 14,
      ragged: 0.5,
      solarize: 0.25,
      washout: 0.1,
    },
  },
  {
    id: "cyanotype",
    label: "Cyanotype",
    stops: [
      { position: 0, color: "#0a1a44" },
      { position: 0.4, color: "#1d4c96" },
      { position: 0.75, color: "#7ea4d4" },
      { position: 1, color: "#eef2f5" },
    ],
    values: {
      contrast: 1.25,
      diffusion: 0.1,
      edgeBurn: 0.25,
      edgeLines: 0,
      exposure: 0.02,
      grain: 0.16,
      grainSize: 1.5,
      halation: 0.15,
      pivot: 0.5,
      radius: 10,
      ragged: 0.5,
      solarize: 0,
      washout: 0.06,
    },
  },
  {
    id: "burned",
    label: "Burned",
    stops: [
      { position: 0, color: "#050202" },
      { position: 0.3, color: "#3a0805" },
      { position: 0.55, color: "#c3241a" },
      { position: 0.8, color: "#ff8a1f" },
      { position: 1, color: "#ffd66e" },
    ],
    values: {
      contrast: 1.7,
      diffusion: 0,
      edgeBurn: 0,
      edgeLines: 0,
      exposure: -0.08,
      grain: 0.28,
      grainSize: 1.5,
      halation: 0.9,
      pivot: 0.5,
      radius: 20,
      ragged: 0.5,
      solarize: 0,
      washout: 0,
    },
  },
  {
    id: "sabattier",
    label: "Sabattier",
    stops: [
      { position: 0, color: "#2a2622" },
      { position: 0.4, color: "#6e6860" },
      { position: 0.75, color: "#c7c1b6" },
      { position: 1, color: "#f0ece4" },
    ],
    values: {
      contrast: 1.1,
      diffusion: 0.05,
      edgeBurn: 0.1,
      edgeLines: 1.1,
      exposure: 0,
      grain: 0.24,
      grainSize: 1.25,
      halation: 0,
      pivot: 0.32,
      radius: 8,
      ragged: 0.5,
      solarize: 0.85,
      washout: 0,
    },
  },
  {
    id: "washed",
    label: "Washed",
    stops: [
      { position: 0, color: "#3d6361" },
      { position: 0.45, color: "#7ea19e" },
      { position: 0.8, color: "#c6dbd6" },
      { position: 1, color: "#eef4f2" },
    ],
    values: {
      contrast: 0.75,
      diffusion: 0.6,
      edgeBurn: 0,
      edgeLines: 0,
      exposure: 0.08,
      grain: 0.38,
      grainSize: 2,
      halation: 0.55,
      pivot: 0.5,
      radius: 36,
      ragged: 0.5,
      solarize: 0,
      washout: 0.05,
    },
  },
  {
    id: "eroded",
    label: "Eroded",
    stops: [
      { position: 0, color: "#4a0f2a" },
      { position: 0.4, color: "#a8285e" },
      { position: 0.75, color: "#e0708f" },
      { position: 1, color: "#fcf4f4" },
    ],
    values: {
      contrast: 1.3,
      diffusion: 0.05,
      edgeBurn: 0,
      edgeLines: 0,
      exposure: 0.05,
      grain: 0.26,
      grainSize: 1.5,
      halation: 0.1,
      pivot: 0.5,
      radius: 10,
      ragged: 0.8,
      solarize: 0,
      washout: 0.55,
    },
  },
]

export const DEFAULT_LUMEN_PRINT_STYLE = LUMEN_PRINT_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_LUMEN_PRINT_STYLE.values
) as (keyof LumenPrintStyleValues)[]

export function matchLumenPrintStyle(values: LayerParameterValues): string {
  const stops = canonicalGradientMapStops(parseGradientMapStops(values.stops))
  const match = LUMEN_PRINT_STYLES.find(
    (style) =>
      canonicalGradientMapStops(style.stops) === stops &&
      STYLE_KEYS.every(
        (key) =>
          typeof values[key] === "number" &&
          Math.abs((values[key] as number) - style.values[key]) < 1e-6
      )
  )
  return match?.id ?? "custom"
}

export function lumenPrintStyleParams(
  style: LumenPrintStyle
): LayerParameterValues {
  return {
    ...style.values,
    stops: serializeGradientMapStops(style.stops),
  }
}
