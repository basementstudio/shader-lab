import type { LayerParameterValues } from "@/types/editor"

export type GrainBlend = "add" | "overlay" | "soft-light"

export type GrainStyleValues = {
  amount: number
  blend: GrainBlend
  chroma: number
  clumping: number
  response: number
  roughness: number
  size: number
}

export type GrainStyle = { id: string; label: string; values: GrainStyleValues }

const FINE_35MM: GrainStyleValues = {
  amount: 0.35,
  blend: "soft-light",
  chroma: 0,
  clumping: 0.2,
  response: 0.5,
  roughness: 0.4,
  size: 1.2,
}

export const GRAIN_STYLES: GrainStyle[] = [
  { id: "fine-35mm", label: "Fine 35mm", values: FINE_35MM },
  {
    id: "color-negative",
    label: "Color Negative",
    values: { ...FINE_35MM, amount: 0.45, chroma: 0.45, clumping: 0.25, response: 0.55, roughness: 0.45, size: 1.4 },
  },
  {
    id: "16mm",
    label: "16mm",
    values: { ...FINE_35MM, amount: 0.55, chroma: 0.15, clumping: 0.5, response: 0.45, roughness: 0.3, size: 2.2 },
  },
  {
    id: "pushed",
    label: "Pushed",
    values: { ...FINE_35MM, amount: 0.55, blend: "overlay", clumping: 0.6, response: 0.35, roughness: 0.8, size: 1.8 },
  },
  {
    id: "digital-noise",
    label: "Digital Noise",
    values: { ...FINE_35MM, amount: 0.45, blend: "add", chroma: 0.8, clumping: 0, response: 0.2, roughness: 1, size: 0.7 },
  },
]

export const DEFAULT_GRAIN_STYLE = GRAIN_STYLES[0]!

const STYLE_KEYS = Object.keys(FINE_35MM) as (keyof GrainStyleValues)[]

export function matchGrainStyle(values: LayerParameterValues): string {
  const match = GRAIN_STYLES.find((style) =>
    STYLE_KEYS.every((key) => {
      const expected = style.values[key]
      const actual = values[key]
      if (typeof expected === "number")
        return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
      return actual === expected
    })
  )
  return match?.id ?? "custom"
}

export function grainStyleParams(style: GrainStyle): LayerParameterValues {
  return { ...style.values }
}
