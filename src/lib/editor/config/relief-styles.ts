import type { LayerParameterValues } from "@/types/editor"

export type ReliefStyleValues = {
  ambient: number
  bevel: number
  color: string
  depth: number
  elevation: number
  engrave: "none" | "parallel" | "radial"
  engraveAngle: number
  engraveDepth: number
  grain: number
  grainSize: number
  lightAngle: number
  lineSpacing: number
  relief: "deboss" | "emboss"
  shininess: number
  specular: number
  surface: "color" | "source"
}

export type ReliefStyle = {
  id: string
  label: string
  values: ReliefStyleValues
}

export const RELIEF_STYLES: ReliefStyle[] = [
  {
    id: "silver-plate",
    label: "Silver Plate",
    values: {
      ambient: 0.35,
      bevel: 2,
      color: "#9c9ea1",
      depth: 1.4,
      elevation: 38,
      engrave: "radial",
      engraveAngle: 0,
      engraveDepth: 0.5,
      grain: 0.35,
      grainSize: 1.2,
      lightAngle: 135,
      lineSpacing: 5,
      relief: "emboss",
      shininess: 28,
      specular: 0.8,
      surface: "color",
    },
  },
  {
    id: "letterpress",
    label: "Letterpress",
    values: {
      ambient: 0.55,
      bevel: 3,
      color: "#efebe3",
      depth: 1,
      elevation: 50,
      engrave: "none",
      engraveAngle: 0,
      engraveDepth: 0,
      grain: 0.12,
      grainSize: 1.5,
      lightAngle: 135,
      lineSpacing: 5,
      relief: "deboss",
      shininess: 8,
      specular: 0.05,
      surface: "color",
    },
  },
  {
    id: "blind-emboss",
    label: "Blind Emboss",
    values: {
      ambient: 0.5,
      bevel: 4,
      color: "#f4f2ee",
      depth: 0.9,
      elevation: 45,
      engrave: "none",
      engraveAngle: 0,
      engraveDepth: 0,
      grain: 0.08,
      grainSize: 1.5,
      lightAngle: 135,
      lineSpacing: 5,
      relief: "emboss",
      shininess: 10,
      specular: 0.1,
      surface: "color",
    },
  },
  {
    id: "gold-foil",
    label: "Gold Foil",
    values: {
      ambient: 0.3,
      bevel: 2,
      color: "#c9a54c",
      depth: 1.2,
      elevation: 35,
      engrave: "parallel",
      engraveAngle: 0,
      engraveDepth: 0.3,
      grain: 0.2,
      grainSize: 1.2,
      lightAngle: 120,
      lineSpacing: 3,
      relief: "emboss",
      shininess: 40,
      specular: 1.2,
      surface: "color",
    },
  },
  {
    id: "source-relief",
    label: "Source Relief",
    values: {
      ambient: 0.45,
      bevel: 2,
      color: "#9c9ea1",
      depth: 1,
      elevation: 40,
      engrave: "parallel",
      engraveAngle: 30,
      engraveDepth: 0.2,
      grain: 0.1,
      grainSize: 1.5,
      lightAngle: 135,
      lineSpacing: 4,
      relief: "emboss",
      shininess: 20,
      specular: 0.3,
      surface: "source",
    },
  },
]

export const DEFAULT_RELIEF_STYLE = RELIEF_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_RELIEF_STYLE.values
) as (keyof ReliefStyleValues)[]

export function matchReliefStyle(values: LayerParameterValues): string {
  const match = RELIEF_STYLES.find((style) =>
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

export function reliefStyleParams(style: ReliefStyle): LayerParameterValues {
  return { ...style.values }
}
