import type { LayerParameterValues } from "@/types/editor"

export type OutlineStyleValues = {
  fill: number
  fillColor: string
  lineColor: string
  offset: number
  ringGap: number
  rings: number
  spacing: number
  style: "dashed" | "double" | "scalloped" | "solid"
  width: number
}

export type OutlineStyle = { id: string; label: string; values: OutlineStyleValues }

const BASE: OutlineStyleValues = {
  fill: 0,
  fillColor: "#ffffff",
  lineColor: "#111111",
  offset: 6,
  ringGap: 8,
  rings: 1,
  spacing: 18,
  style: "solid",
  width: 2,
}

export const OUTLINE_STYLES: OutlineStyle[] = [
  { id: "stroke", label: "Stroke", values: BASE },
  {
    id: "cloud",
    label: "Cloud",
    values: { ...BASE, style: "scalloped", offset: 14, spacing: 22, width: 2, fill: 1, fillColor: "#f2f0ea" },
  },
  {
    id: "sticker",
    label: "Sticker",
    values: { ...BASE, offset: 12, width: 2, fill: 1, fillColor: "#ffffff", lineColor: "#d9d9d9" },
  },
  {
    id: "contour-rings",
    label: "Contour Rings",
    values: { ...BASE, offset: 6, width: 1.2, rings: 7, ringGap: 9, lineColor: "#ffffff" },
  },
  {
    id: "cut-line",
    label: "Cut Line",
    values: { ...BASE, style: "dashed", offset: 10, width: 1.5, spacing: 10 },
  },
  {
    id: "double",
    label: "Double",
    values: { ...BASE, style: "double", offset: 4, width: 2 },
  },
]

export const DEFAULT_OUTLINE_STYLE = OUTLINE_STYLES[0]!

const STYLE_KEYS = Object.keys(BASE) as (keyof OutlineStyleValues)[]

export function matchOutlineStyle(values: LayerParameterValues): string {
  const match = OUTLINE_STYLES.find((style) =>
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

export function outlineStyleParams(style: OutlineStyle): LayerParameterValues {
  return { ...style.values }
}
