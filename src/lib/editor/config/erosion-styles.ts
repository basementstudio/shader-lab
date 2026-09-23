import type { LayerParameterValues } from "@/types/editor"

export type ErosionStyleValues = {
  clumping: number
  edgeWidth: number
  erode: number
  mode: "alpha" | "dark" | "edges" | "light"
  output: "paper" | "transparent"
  paperColor: string
  scatter: number
  speckleSize: number
  speed: number
}

export type ErosionStyle = {
  id: string
  label: string
  values: ErosionStyleValues
}

export const EROSION_STYLES: ErosionStyle[] = [
  {
    id: "disintegrate",
    label: "Disintegrate",
    values: {
      clumping: 0.35,
      edgeWidth: 6,
      erode: 0.6,
      mode: "edges",
      output: "paper",
      paperColor: "#f2efe8",
      scatter: 0.5,
      speckleSize: 3,
      speed: 0,
    },
  },
  {
    id: "paper-erosion",
    label: "Paper Erosion",
    values: {
      clumping: 0.55,
      edgeWidth: 3,
      erode: 0.55,
      mode: "light",
      output: "paper",
      paperColor: "#fbf6f2",
      scatter: 0.25,
      speckleSize: 1.5,
      speed: 0,
    },
  },
  {
    id: "crumbled-cutout",
    label: "Crumbled Cutout",
    values: {
      clumping: 0.3,
      edgeWidth: 10,
      erode: 0.78,
      mode: "alpha",
      output: "transparent",
      paperColor: "#f2efe8",
      scatter: 0.6,
      speckleSize: 2.5,
      speed: 0,
    },
  },
]

export const DEFAULT_EROSION_STYLE = EROSION_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_EROSION_STYLE.values
) as (keyof ErosionStyleValues)[]

export function matchErosionStyle(values: LayerParameterValues): string {
  const match = EROSION_STYLES.find((style) =>
    STYLE_KEYS.every((key) => {
      const expected = style.values[key]
      const actual = values[key]
      if (typeof expected === "number")
        return typeof actual === "number" && Math.abs(actual - expected) < 1e-6
      return (
        typeof actual === "string" &&
        actual.toLowerCase() === expected.toLowerCase()
      )
    })
  )
  return match?.id ?? "custom"
}

export function erosionStyleParams(style: ErosionStyle): LayerParameterValues {
  return { ...style.values }
}
