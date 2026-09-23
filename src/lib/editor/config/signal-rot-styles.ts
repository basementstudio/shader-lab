import type { LayerParameterValues } from "@/types/editor"

export type SignalRotStyleValues = {
  bandSize: number
  chroma: number
  crush: number
  direction: "horizontal" | "vertical"
  drag: number
  dragLength: number
  dropout: number
  dropoutColor: string
  lineNoise: number
  speed: number
  stretch: number
  tear: number
  wobble: number
  wobbleScale: number
}

export type SignalRotStyle = {
  id: string
  label: string
  values: SignalRotStyleValues
}

export const SIGNAL_ROT_STYLES: SignalRotStyle[] = [
  {
    id: "scanner-drag",
    label: "Scanner Drag",
    values: {
      bandSize: 0.14,
      chroma: 0,
      crush: 0,
      direction: "vertical",
      drag: 0.55,
      dragLength: 0.35,
      dropout: 0.3,
      dropoutColor: "#ffffff",
      lineNoise: 0,
      speed: 0,
      stretch: 0.35,
      tear: 0.25,
      wobble: 0.45,
      wobbleScale: 0.35,
    },
  },
  {
    id: "signal-rot",
    label: "Signal Rot",
    values: {
      bandSize: 0.06,
      chroma: 0.45,
      crush: 0.55,
      direction: "horizontal",
      drag: 0.2,
      dragLength: 0.12,
      dropout: 0,
      dropoutColor: "#000000",
      lineNoise: 0.5,
      speed: 1,
      stretch: 0.1,
      tear: 0.18,
      wobble: 0.12,
      wobbleScale: 0.2,
    },
  },
  {
    id: "torn-scan",
    label: "Torn Scan",
    values: {
      bandSize: 0.2,
      chroma: 0,
      crush: 0,
      direction: "vertical",
      drag: 0.3,
      dragLength: 0.6,
      dropout: 0.55,
      dropoutColor: "#ffffff",
      lineNoise: 0,
      speed: 0,
      stretch: 0.15,
      tear: 0.5,
      wobble: 0.15,
      wobbleScale: 0.5,
    },
  },
]

export const DEFAULT_SIGNAL_ROT_STYLE = SIGNAL_ROT_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_SIGNAL_ROT_STYLE.values
) as (keyof SignalRotStyleValues)[]

export function matchSignalRotStyle(values: LayerParameterValues): string {
  const match = SIGNAL_ROT_STYLES.find((style) =>
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

export function signalRotStyleParams(
  style: SignalRotStyle
): LayerParameterValues {
  return { ...style.values }
}
