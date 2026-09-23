import type { LayerParameterValues } from "@/types/editor"

export type FlaresStyleValues = {
  color: string
  coreColor: string
  coreGlow: number
  coreSize: number
  falloff: number
  intensity: number
  length: number
  lengthJitter: number
  rays: number
  rotation: number
  secondaryLength: number
  thickness: number
}

export type FlaresStyle = {
  id: string
  label: string
  values: FlaresStyleValues
}

export const FLARES_STYLES: FlaresStyle[] = [
  {
    id: "cross",
    label: "Cross",
    values: {
      color: "#ff7a3d",
      coreColor: "#fff3e0",
      coreGlow: 1,
      coreSize: 6,
      falloff: 1.5,
      intensity: 4,
      length: 120,
      lengthJitter: 0,
      rays: 4,
      rotation: 0,
      secondaryLength: 1,
      thickness: 1,
    },
  },
  {
    id: "star",
    label: "Star",
    values: {
      color: "#ff9a4d",
      coreColor: "#fff6e6",
      coreGlow: 1.2,
      coreSize: 7,
      falloff: 1.8,
      intensity: 4,
      length: 140,
      lengthJitter: 0,
      rays: 8,
      rotation: 0,
      secondaryLength: 0.45,
      thickness: 1,
    },
  },
  {
    id: "starburst",
    label: "Starburst",
    values: {
      color: "#ffb347",
      coreColor: "#ffffff",
      coreGlow: 1.4,
      coreSize: 9,
      falloff: 2.2,
      intensity: 3.5,
      length: 160,
      lengthJitter: 0.7,
      rays: 14,
      rotation: 7,
      secondaryLength: 0.7,
      thickness: 0.5,
    },
  },
  {
    id: "asterisk",
    label: "Asterisk",
    values: {
      color: "#ff5a5a",
      coreColor: "#ffe9e9",
      coreGlow: 0.8,
      coreSize: 5,
      falloff: 1.2,
      intensity: 4,
      length: 90,
      lengthJitter: 0,
      rays: 6,
      rotation: 90,
      secondaryLength: 1,
      thickness: 1,
    },
  },
  {
    id: "anamorphic",
    label: "Anamorphic",
    values: {
      color: "#5aa8ff",
      coreColor: "#eef6ff",
      coreGlow: 0.8,
      coreSize: 8,
      falloff: 1,
      intensity: 3,
      length: 420,
      lengthJitter: 0,
      rays: 2,
      rotation: 0,
      secondaryLength: 1,
      thickness: 1.5,
    },
  },
]

export const DEFAULT_FLARES_STYLE = FLARES_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_FLARES_STYLE.values
) as (keyof FlaresStyleValues)[]

export function matchFlaresStyle(values: LayerParameterValues): string {
  const match = FLARES_STYLES.find((style) =>
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

export function flaresStyleParams(style: FlaresStyle): LayerParameterValues {
  return { ...style.values }
}
