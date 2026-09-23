import {
  canonicalGradientMapStops,
  DEFAULT_CONNECTED_DOTS_STOPS,
  type GradientMapStop,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues } from "@/types/editor"

export type ConnectedDotsStyleValues = {
  background: "color" | "image" | "transparent"
  backgroundColor: string
  blobiness: number
  colorMode: "ink" | "palette" | "source"
  cutoff: number
  dotShape: "circle" | "plus" | "ring" | "square"
  ink: string
  invert: boolean
  jitter: number
  lineWidth: number
  linkMax: number
  linkMin: number
  links: number
  linkThreshold: number
  maxSize: number
  minSize: number
  mode: "blobs" | "graph" | "plexus"
  range: number
  spacing: number
}

export type ConnectedDotsStyle = {
  id: string
  label: string
  stops: GradientMapStop[]
  values: ConnectedDotsStyleValues
}

const MONO: GradientMapStop[] = [
  { position: 0, color: "#111111" },
  { position: 1, color: "#111111" },
]

export const CONNECTED_DOTS_STYLES: ConnectedDotsStyle[] = [
  {
    id: "portrait-graph",
    label: "Portrait Graph",
    stops: DEFAULT_CONNECTED_DOTS_STOPS,
    values: {
      background: "color",
      backgroundColor: "#c4c4c4",
      blobiness: 0.5,
      colorMode: "palette",
      cutoff: 0.05,
      dotShape: "circle",
      ink: "#111111",
      invert: false,
      jitter: 0.9,
      lineWidth: 0.8,
      linkMax: 0.46,
      linkMin: 0.3,
      links: 0.85,
      linkThreshold: 0.5,
      maxSize: 0.74,
      minSize: 0.46,
      mode: "graph",
      range: 1.6,
      spacing: 10,
    },
  },
  {
    id: "ink-blobs",
    label: "Ink Blobs",
    stops: MONO,
    values: {
      background: "color",
      backgroundColor: "#f1ede4",
      blobiness: 0.7,
      colorMode: "ink",
      cutoff: 0.4,
      dotShape: "circle",
      ink: "#111111",
      invert: false,
      jitter: 0.8,
      lineWidth: 0.8,
      linkMax: 0.8,
      linkMin: 0.2,
      links: 0.9,
      linkThreshold: 0.6,
      maxSize: 0.7,
      minSize: 0.15,
      mode: "blobs",
      range: 1.6,
      spacing: 12,
    },
  },
  {
    id: "plexus",
    label: "Plexus",
    stops: DEFAULT_CONNECTED_DOTS_STOPS,
    values: {
      background: "color",
      backgroundColor: "#07090d",
      blobiness: 0.5,
      colorMode: "ink",
      cutoff: 0.25,
      dotShape: "circle",
      ink: "#dfe9ff",
      invert: true,
      jitter: 0.9,
      lineWidth: 0.7,
      linkMax: 0.5,
      linkMin: 0.1,
      links: 1,
      linkThreshold: 0.2,
      maxSize: 0.3,
      minSize: 0.12,
      mode: "plexus",
      range: 2.2,
      spacing: 18,
    },
  },
  {
    id: "constellation",
    label: "Constellation",
    stops: DEFAULT_CONNECTED_DOTS_STOPS,
    values: {
      background: "color",
      backgroundColor: "#050608",
      blobiness: 0.5,
      colorMode: "source",
      cutoff: 0.55,
      dotShape: "plus",
      ink: "#ffffff",
      invert: true,
      jitter: 1,
      lineWidth: 0.5,
      linkMax: 0.4,
      linkMin: 0.1,
      links: 1,
      linkThreshold: 0.2,
      maxSize: 0.5,
      minSize: 0.2,
      mode: "plexus",
      range: 2.8,
      spacing: 26,
    },
  },
]

export const DEFAULT_CONNECTED_DOTS_STYLE = CONNECTED_DOTS_STYLES[0]!

const STYLE_KEYS = Object.keys(
  DEFAULT_CONNECTED_DOTS_STYLE.values
) as (keyof ConnectedDotsStyleValues)[]

export function matchConnectedDotsStyle(values: LayerParameterValues): string {
  const stops = canonicalGradientMapStops(parseGradientMapStops(values.stops))
  const match = CONNECTED_DOTS_STYLES.find(
    (style) =>
      canonicalGradientMapStops(style.stops) === stops &&
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

export function connectedDotsStyleParams(
  style: ConnectedDotsStyle
): LayerParameterValues {
  return { ...style.values, stops: serializeGradientMapStops(style.stops) }
}
