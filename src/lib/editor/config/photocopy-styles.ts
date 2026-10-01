import type { LayerParameterValues } from "@/types/editor"

export type PhotocopyStyleValues = {
  contrast: number
  creases: number
  fill: number
  generations: number
  grain: number
  paperColor: string
  shift: number
  speckle: number
  streaks: number
  threshold: number
  tonerColor: string
}

export type PhotocopyStyle = { id: string; label: string; values: PhotocopyStyleValues }

const OFFICE: PhotocopyStyleValues = {
  contrast: 0.7,
  creases: 0,
  fill: 0.4,
  generations: 2,
  grain: 0.4,
  paperColor: "#efece4",
  shift: 1,
  speckle: 0.3,
  streaks: 0.2,
  threshold: 0.5,
  tonerColor: "#141414",
}

export const PHOTOCOPY_STYLES: PhotocopyStyle[] = [
  { id: "office-copy", label: "Office Copy", values: OFFICE },
  {
    id: "zine",
    label: "Zine",
    values: { ...OFFICE, contrast: 0.95, generations: 5, fill: 0.7, speckle: 0.7, streaks: 0.5, shift: 2.5, creases: 0.5, threshold: 0.55 },
  },
  {
    id: "fax",
    label: "Fax",
    values: { ...OFFICE, contrast: 1, generations: 3, fill: 0.2, speckle: 0.5, streaks: 0.8, shift: 0.5, grain: 0.2, paperColor: "#f4f1e6", threshold: 0.48 },
  },
  {
    id: "blueprint-copy",
    label: "Blueprint Copy",
    values: { ...OFFICE, contrast: 0.6, generations: 2, fill: 0.5, speckle: 0.25, streaks: 0.15, tonerColor: "#f1f4ff", paperColor: "#1f3f8f", threshold: 0.5 },
  },
  {
    id: "risograph",
    label: "Pink Flyer",
    values: { ...OFFICE, contrast: 0.85, generations: 3, fill: 0.6, speckle: 0.4, streaks: 0.3, shift: 1.5, tonerColor: "#e8327a", paperColor: "#f6efe0", creases: 0.25 },
  },
]

export const DEFAULT_PHOTOCOPY_STYLE = PHOTOCOPY_STYLES[0]!

const STYLE_KEYS = Object.keys(OFFICE) as (keyof PhotocopyStyleValues)[]

export function matchPhotocopyStyle(values: LayerParameterValues): string {
  const match = PHOTOCOPY_STYLES.find((style) =>
    STYLE_KEYS.every((key) => {
      const expected = style.values[key]
      const actual = values[key]
      if (typeof expected === "number")
        return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
      return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase()
    })
  )
  return match?.id ?? "custom"
}

export function photocopyStyleParams(style: PhotocopyStyle): LayerParameterValues {
  return { ...style.values }
}
