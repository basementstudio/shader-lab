import type { LayerParameterValues } from "@/types/editor"

export type PlotterStyleValues = {
  amplitude: number
  angle: number
  bleed: number
  colorMode: "ink" | "pens" | "source"
  crossAngle: number
  crosshatch: boolean
  frequency: number
  gap: number
  inkColor: string
  levels: number
  mode: "contour" | "flow" | "hatch" | "spiral" | "squiggle" | "stipple"
  paperColor: string
  pressure: number
  smoothing: number
  threshold: number
  weight: number
  wobble: number
}

export type PlotterStyle = { id: string; label: string; values: PlotterStyleValues }

const BASE: PlotterStyleValues = {
  amplitude: 0.45,
  angle: 90,
  bleed: 0.3,
  colorMode: "ink",
  crossAngle: 135,
  crosshatch: true,
  frequency: 0.5,
  gap: 12,
  inkColor: "#1a1a1a",
  levels: 8,
  mode: "hatch",
  paperColor: "#f5f0e8",
  pressure: 0.5,
  smoothing: 4,
  threshold: 0.5,
  weight: 1.5,
  wobble: 0.3,
}

export const PLOTTER_STYLES: PlotterStyle[] = [
  { id: "crosshatch", label: "Crosshatch", values: BASE },
  {
    id: "three-pens",
    label: "Three Pens",
    values: { ...BASE, colorMode: "pens", gap: 9, weight: 1.1, angle: 60, crossAngle: 150, wobble: 0.2 },
  },
  {
    id: "flow",
    label: "Flow Lines",
    values: { ...BASE, mode: "flow", gap: 5, weight: 0.8, pressure: 0.6, smoothing: 6, wobble: 0.05, bleed: 0.15, threshold: 0.2, inkColor: "#1c2c5a" },
  },
  {
    id: "contour",
    label: "Contour",
    values: { ...BASE, mode: "contour", levels: 7, smoothing: 16, weight: 1.6, pressure: 0, wobble: 0.1, bleed: 0.2 },
  },
  {
    id: "squiggle",
    label: "Squiggle",
    values: { ...BASE, mode: "squiggle", angle: 90, gap: 10, weight: 1.1, amplitude: 1, frequency: 0.8, smoothing: 3, wobble: 0.1 },
  },
  {
    id: "spiral",
    label: "Spiral",
    values: { ...BASE, mode: "spiral", gap: 7, weight: 1, smoothing: 3, wobble: 0.05, bleed: 0.2 },
  },
  {
    id: "stipple",
    label: "Stipple",
    values: { ...BASE, mode: "stipple", gap: 5, weight: 1.4, pressure: 0.3, threshold: 0.2, smoothing: 2, wobble: 0, bleed: 0.25 },
  },
]

export const DEFAULT_PLOTTER_STYLE = PLOTTER_STYLES[0]!

const STYLE_KEYS = Object.keys(BASE) as (keyof PlotterStyleValues)[]

export function matchPlotterStyle(values: LayerParameterValues): string {
  const match = PLOTTER_STYLES.find((style) =>
    STYLE_KEYS.every((key) => {
      const expected = style.values[key]
      const actual = values[key]
      if (typeof expected === "number")
        return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
      if (typeof expected === "boolean") return actual === expected
      return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase()
    })
  )
  return match?.id ?? "custom"
}

export function plotterStyleParams(style: PlotterStyle): LayerParameterValues {
  return { ...style.values }
}
