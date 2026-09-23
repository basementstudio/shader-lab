import type { LayerParameterValues } from "@/types/editor"

export type GlassStyleValues = {
  cellSize: number
  dispersion: number
  distance: number
  edges: number
  frost: number
  frostSize: number
  highlights: number
  irregularity: number
  pattern: "frosted" | "hammered" | "hex" | "pyramid" | "reeded"
  profile: "round" | "sharp"
  refraction: number
}

export type GlassStyle = {
  id: string
  label: string
  values: GlassStyleValues
}

export const GLASS_STYLES: GlassStyle[] = [
  {
    id: "reeded",
    label: "Reeded",
    values: {
      cellSize: 22,
      dispersion: 0.15,
      distance: 10,
      edges: 0.35,
      frost: 0.1,
      frostSize: 1.5,
      highlights: 0.8,
      irregularity: 0.7,
      pattern: "reeded",
      profile: "round",
      refraction: 0.3,
    },
  },
  {
    id: "frosted-reeded",
    label: "Frosted Reeded",
    values: {
      cellSize: 20,
      dispersion: 0.1,
      distance: 36,
      edges: 0.3,
      frost: 0.55,
      frostSize: 1.2,
      highlights: 1,
      irregularity: 0.7,
      pattern: "reeded",
      profile: "round",
      refraction: 0.28,
    },
  },
  {
    id: "hammered",
    label: "Hammered",
    values: {
      cellSize: 38,
      dispersion: 0.1,
      distance: 14,
      edges: 0.45,
      frost: 0.2,
      frostSize: 1.5,
      highlights: 1,
      irregularity: 0.85,
      pattern: "hammered",
      profile: "round",
      refraction: 0.35,
    },
  },
  {
    id: "pyramid",
    label: "Pyramid",
    values: {
      cellSize: 24,
      dispersion: 0.2,
      distance: 5,
      edges: 0.5,
      frost: 0,
      frostSize: 1.5,
      highlights: 1.2,
      irregularity: 0.7,
      pattern: "pyramid",
      profile: "round",
      refraction: 0.85,
    },
  },
  {
    id: "hex",
    label: "Hex",
    values: {
      cellSize: 12,
      dispersion: 0.25,
      distance: 12,
      edges: 0.35,
      frost: 0.15,
      frostSize: 1,
      highlights: 1.4,
      irregularity: 0.7,
      pattern: "hex",
      profile: "round",
      refraction: 0.75,
    },
  },
  {
    id: "frosted",
    label: "Frosted",
    values: {
      cellSize: 22,
      dispersion: 0,
      distance: 28,
      edges: 0,
      frost: 0.6,
      frostSize: 1.5,
      highlights: 0.5,
      irregularity: 0.7,
      pattern: "frosted",
      profile: "round",
      refraction: 0.3,
    },
  },
]

export const DEFAULT_GLASS_STYLE = GLASS_STYLES[0]!

const STYLE_KEYS = Object.keys(DEFAULT_GLASS_STYLE.values) as (keyof GlassStyleValues)[]

export function matchGlassStyle(values: LayerParameterValues): string {
  const match = GLASS_STYLES.find((style) =>
    STYLE_KEYS.every((key) => {
      const expected = style.values[key]
      const actual = values[key]
      if (typeof expected === "number")
        return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
      return typeof actual === "string" && actual === expected
    })
  )
  return match?.id ?? "custom"
}

export function glassStyleParams(style: GlassStyle): LayerParameterValues {
  return { ...style.values }
}
