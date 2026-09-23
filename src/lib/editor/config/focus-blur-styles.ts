import type { LayerParameterValues } from "@/types/editor"

export type FocusBlurStyleValues = {
  angle: number
  blurFrom: "depth" | "linear" | "luminance" | "radial" | "uniform"
  focus: number
  grain: number
  grainFollow: number
  grainSize: number
  highlights: number
  kind: "gaussian" | "lens" | "motion"
  motionAngle: number
  radius: number
  range: number
  transition: number
}

export type FocusBlurStyle = {
  id: string
  label: string
  values: FocusBlurStyleValues
}

export const FOCUS_BLUR_STYLES: FocusBlurStyle[] = [
  {
    id: "depth-of-field",
    label: "Depth of Field",
    values: {
      angle: 0,
      blurFrom: "depth",
      focus: 0.85,
      grain: 0.35,
      grainFollow: 0.6,
      grainSize: 1.2,
      highlights: 0.4,
      kind: "lens",
      motionAngle: 0,
      radius: 70,
      range: 0.12,
      transition: 0.45,
    },
  },
  {
    id: "tilt-shift",
    label: "Tilt-Shift",
    values: {
      angle: 0,
      blurFrom: "linear",
      focus: 0.5,
      grain: 0.1,
      grainFollow: 0.5,
      grainSize: 1.2,
      highlights: 0.2,
      kind: "lens",
      motionAngle: 0,
      radius: 40,
      range: 0.25,
      transition: 0.5,
    },
  },
  {
    id: "vignette",
    label: "Vignette",
    values: {
      angle: 0,
      blurFrom: "radial",
      focus: 0.5,
      grain: 0.15,
      grainFollow: 0.7,
      grainSize: 1.2,
      highlights: 0,
      kind: "gaussian",
      motionAngle: 0,
      radius: 60,
      range: 0.55,
      transition: 0.6,
    },
  },
  {
    id: "soft",
    label: "Soft",
    values: {
      angle: 0,
      blurFrom: "uniform",
      focus: 0.5,
      grain: 0.2,
      grainFollow: 0,
      grainSize: 1.2,
      highlights: 0,
      kind: "gaussian",
      motionAngle: 0,
      radius: 24,
      range: 0.15,
      transition: 0.4,
    },
  },
  {
    id: "motion",
    label: "Motion",
    values: {
      angle: 0,
      blurFrom: "uniform",
      focus: 0.5,
      grain: 0.1,
      grainFollow: 0,
      grainSize: 1.2,
      highlights: 0,
      kind: "motion",
      motionAngle: 0,
      radius: 80,
      range: 0.15,
      transition: 0.4,
    },
  },
]

export const DEFAULT_FOCUS_BLUR_STYLE = FOCUS_BLUR_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_FOCUS_BLUR_STYLE.values
) as (keyof FocusBlurStyleValues)[]

export function matchFocusBlurStyle(values: LayerParameterValues): string {
  const match = FOCUS_BLUR_STYLES.find((style) =>
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

export function focusBlurStyleParams(
  style: FocusBlurStyle
): LayerParameterValues {
  return { ...style.values }
}
