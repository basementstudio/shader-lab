export type GradientMapStop = { color: string; position: number }

export const COLOR_MAP_LUT_SIZE = 256

export const GRADIENT_MAP_PRESETS: {
  id: string
  label: string
  stops: GradientMapStop[]
}[] = [
  {
    id: "thermal",
    label: "Thermal",
    stops: [
      { position: 0, color: "#08083a" },
      { position: 0.25, color: "#1f5cff" },
      { position: 0.5, color: "#2fd27a" },
      { position: 0.75, color: "#f7e63b" },
      { position: 1, color: "#ff2e63" },
    ],
  },
  {
    id: "duotone",
    label: "Duotone",
    stops: [
      { position: 0, color: "#1a1040" },
      { position: 1, color: "#ff7a59" },
    ],
  },
  {
    id: "sepia",
    label: "Sepia",
    stops: [
      { position: 0, color: "#2b1d0e" },
      { position: 0.5, color: "#8c6a3f" },
      { position: 1, color: "#f1e4c6" },
    ],
  },
  {
    id: "neon",
    label: "Neon",
    stops: [
      { position: 0, color: "#0b0033" },
      { position: 0.5, color: "#ff00aa" },
      { position: 1, color: "#00ffe1" },
    ],
  },
  {
    id: "grayscale",
    label: "Grayscale",
    stops: [
      { position: 0, color: "#000000" },
      { position: 1, color: "#ffffff" },
    ],
  },
]

export const DEFAULT_GRADIENT_MAP_STOPS = GRADIENT_MAP_PRESETS[0]!.stops

export const DEFAULT_LUMEN_PRINT_STOPS: GradientMapStop[] = [
  { position: 0, color: "#2a0f2e" },
  { position: 0.35, color: "#7a2f5e" },
  { position: 0.7, color: "#d58c78" },
  { position: 1, color: "#f4e6d4" },
]

const HEX = /^#[0-9a-f]{6}$/i

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function serializeGradientMapStops(stops: GradientMapStop[]): string {
  return JSON.stringify(
    stops.map((stop) => ({
      position: Math.round(stop.position * 10000) / 10000,
      color: stop.color.toLowerCase(),
    }))
  )
}

export function canonicalGradientMapStops(stops: GradientMapStop[]): string {
  return serializeGradientMapStops(
    [...stops].sort((a, b) => a.position - b.position)
  )
}

export function parseGradientMapStops(value: unknown): GradientMapStop[] {
  let raw: unknown = value
  if (typeof value === "string") {
    if (value.trim() === "") return DEFAULT_GRADIENT_MAP_STOPS.map((s) => ({ ...s }))
    try {
      raw = JSON.parse(value)
    } catch {
      return DEFAULT_GRADIENT_MAP_STOPS.map((s) => ({ ...s }))
    }
  }
  if (!Array.isArray(raw)) return DEFAULT_GRADIENT_MAP_STOPS.map((s) => ({ ...s }))
  const stops: GradientMapStop[] = []
  for (const entry of raw.slice(0, 8)) {
    if (!entry || typeof entry !== "object") continue
    const { color, position } = entry as Record<string, unknown>
    if (typeof color !== "string" || !HEX.test(color)) continue
    if (typeof position !== "number" || !Number.isFinite(position)) continue
    stops.push({
      color: color.toLowerCase(),
      position: Math.min(1, Math.max(0, position)),
    })
  }
  if (stops.length < 2) return DEFAULT_GRADIENT_MAP_STOPS.map((s) => ({ ...s }))
  return stops
}

export function evaluateGradientMapStops(
  stops: GradientMapStop[],
  t: number
): [number, number, number] {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!(first && last)) return [t, t, t]
  if (t <= first.position) return hexToRgb(first.color)
  if (t >= last.position) return hexToRgb(last.color)
  for (let s = 0; s < sorted.length - 1; s++) {
    const a = sorted[s]!
    const b = sorted[s + 1]!
    if (t >= a.position && t <= b.position) {
      const range = b.position - a.position
      const local = range > 0 ? (t - a.position) / range : 0
      const [r0, g0, b0] = hexToRgb(a.color)
      const [r1, g1, b1] = hexToRgb(b.color)
      return [r0 + (r1 - r0) * local, g0 + (g1 - g0) * local, b0 + (b1 - b0) * local]
    }
  }
  return hexToRgb(last.color)
}

export function buildColorMapBytes(stops: GradientMapStop[]): Uint8Array {
  const data = new Uint8Array(COLOR_MAP_LUT_SIZE * 4)
  for (let i = 0; i < COLOR_MAP_LUT_SIZE; i++) {
    const [r, g, b] = evaluateGradientMapStops(stops, i / (COLOR_MAP_LUT_SIZE - 1))
    data[i * 4] = Math.round(r * 255)
    data[i * 4 + 1] = Math.round(g * 255)
    data[i * 4 + 2] = Math.round(b * 255)
    data[i * 4 + 3] = 255
  }
  return data
}

export function buildLinearColorMap(stops: GradientMapStop[]): Float32Array {
  const data = new Float32Array(COLOR_MAP_LUT_SIZE * 4)
  for (let i = 0; i < COLOR_MAP_LUT_SIZE; i++) {
    const [r, g, b] = evaluateGradientMapStops(stops, i / (COLOR_MAP_LUT_SIZE - 1))
    data[i * 4] = srgbToLinear(r)
    data[i * 4 + 1] = srgbToLinear(g)
    data[i * 4 + 2] = srgbToLinear(b)
    data[i * 4 + 3] = 1
  }
  return data
}
