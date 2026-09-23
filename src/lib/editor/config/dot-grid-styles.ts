import type { LayerParameterValues } from "@/types/editor"

export type DotGridStyleValues = {
  backgroundColor: string
  contrast: number
  inkColor: string
  inkMode: "ink" | "source"
  invert: boolean
  level: number
  maxDot: number
  minDot: number
  shape: "circle" | "square"
  softness: number
  spacing: number
  underlay: number
  underlayBlur: number
}

export type DotGridStyle = {
  id: string
  label: string
  values: DotGridStyleValues
}

export const DOT_GRID_STYLES: DotGridStyle[] = [
  {
    id: "coordinate",
    label: "Coordinate",
    values: {
      backgroundColor: "#d9e8ef",
      contrast: 2.4,
      inkColor: "#141414",
      inkMode: "ink",
      invert: false,
      level: 0.62,
      maxDot: 1.08,
      minDot: 0.16,
      shape: "circle",
      softness: 0.9,
      spacing: 12,
      underlay: 0.45,
      underlayBlur: 28,
    },
  },
  {
    id: "source-dots",
    label: "Source Dots",
    values: {
      backgroundColor: "#f5f3ee",
      contrast: 1.2,
      inkColor: "#000000",
      inkMode: "source",
      invert: false,
      level: 0.5,
      maxDot: 1.2,
      minDot: 0.1,
      shape: "circle",
      softness: 0.5,
      spacing: 16,
      underlay: 0,
      underlayBlur: 24,
    },
  },
  {
    id: "night",
    label: "Night",
    values: {
      backgroundColor: "#0b0b0c",
      contrast: 1.5,
      inkColor: "#f4f1ea",
      inkMode: "ink",
      invert: true,
      level: 0.5,
      maxDot: 1,
      minDot: 0.08,
      shape: "circle",
      softness: 0.6,
      spacing: 10,
      underlay: 0.15,
      underlayBlur: 40,
    },
  },
  {
    id: "pixel-grid",
    label: "Pixel Grid",
    values: {
      backgroundColor: "#ffffff",
      contrast: 2.2,
      inkColor: "#1a1a1a",
      inkMode: "ink",
      invert: false,
      level: 0.5,
      maxDot: 1,
      minDot: 0,
      shape: "square",
      softness: 0.3,
      spacing: 12,
      underlay: 0,
      underlayBlur: 24,
    },
  },
]

export const DEFAULT_DOT_GRID_STYLE = DOT_GRID_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_DOT_GRID_STYLE.values
) as (keyof DotGridStyleValues)[]

export function matchDotGridStyle(values: LayerParameterValues): string {
  const match = DOT_GRID_STYLES.find((style) =>
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

export function dotGridStyleParams(style: DotGridStyle): LayerParameterValues {
  return { ...style.values }
}
