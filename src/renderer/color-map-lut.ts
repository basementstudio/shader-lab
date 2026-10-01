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

export const DEFAULT_CONNECTED_DOTS_STOPS: GradientMapStop[] = [
  { position: 0, color: "#1b1c22" },
  { position: 0.18, color: "#2b7fd6" },
  { position: 0.34, color: "#6fb3ef" },
  { position: 0.5, color: "#9cc47a" },
  { position: 0.66, color: "#e8746a" },
  { position: 0.82, color: "#c78de0" },
  { position: 1, color: "#ffffff" },
]

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

export function parseGradientMapStops(
  value: unknown,
  fallback: GradientMapStop[] = DEFAULT_GRADIENT_MAP_STOPS
): GradientMapStop[] {
  let raw: unknown = value
  if (typeof value === "string") {
    if (value.trim() === "") return fallback.map((s) => ({ ...s }))
    try {
      raw = JSON.parse(value)
    } catch {
      return fallback.map((s) => ({ ...s }))
    }
  }
  if (!Array.isArray(raw)) return fallback.map((s) => ({ ...s }))
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
  if (stops.length < 2) return fallback.map((s) => ({ ...s }))
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

type ResolvedStop = { position: number; rgb: [number, number, number] }

function resolveGradientMapStops(stops: GradientMapStop[]): ResolvedStop[] {
  return [...stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => ({ position: stop.position, rgb: hexToRgb(stop.color) }))
}

function evaluateResolvedStops(
  sorted: ResolvedStop[],
  t: number
): [number, number, number] {
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!(first && last)) return [t, t, t]
  if (t <= first.position) return first.rgb
  if (t >= last.position) return last.rgb
  for (let s = 0; s < sorted.length - 1; s++) {
    const a = sorted[s]!
    const b = sorted[s + 1]!
    if (t >= a.position && t <= b.position) {
      const range = b.position - a.position
      const local = range > 0 ? (t - a.position) / range : 0
      const [r0, g0, b0] = a.rgb
      const [r1, g1, b1] = b.rgb
      return [r0 + (r1 - r0) * local, g0 + (g1 - g0) * local, b0 + (b1 - b0) * local]
    }
  }
  return last.rgb
}

export function buildColorMapBytes(stops: GradientMapStop[]): Uint8Array {
  const data = new Uint8Array(COLOR_MAP_LUT_SIZE * 4)
  const sorted = resolveGradientMapStops(stops)
  for (let i = 0; i < COLOR_MAP_LUT_SIZE; i++) {
    const [r, g, b] = evaluateResolvedStops(sorted, i / (COLOR_MAP_LUT_SIZE - 1))
    data[i * 4] = Math.round(r * 255)
    data[i * 4 + 1] = Math.round(g * 255)
    data[i * 4 + 2] = Math.round(b * 255)
    data[i * 4 + 3] = 255
  }
  return data
}

export function writeLinearColorMap(
  stops: GradientMapStop[],
  data: Float32Array
): Float32Array {
  const sorted = resolveGradientMapStops(stops)
  for (let i = 0; i < COLOR_MAP_LUT_SIZE; i++) {
    const [r, g, b] = evaluateResolvedStops(sorted, i / (COLOR_MAP_LUT_SIZE - 1))
    data[i * 4] = srgbToLinear(r)
    data[i * 4 + 1] = srgbToLinear(g)
    data[i * 4 + 2] = srgbToLinear(b)
    data[i * 4 + 3] = 1
  }
  return data
}

export function buildLinearColorMap(stops: GradientMapStop[]): Float32Array {
  return writeLinearColorMap(stops, new Float32Array(COLOR_MAP_LUT_SIZE * 4))
}

type AlignedRamps = { from: ResolvedStop[]; to: ResolvedStop[] }

const RAMP_CACHE_LIMIT = 64
const alignedRampCache = new Map<string, Map<string, AlignedRamps>>()

function alignRampStops(
  few: ResolvedStop[],
  many: ResolvedStop[]
): ResolvedStop[] {
  const n = few.length
  const m = many.length
  const cost: number[][] = []
  for (let i = 0; i <= n; i++) cost.push(new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY))
  cost[0]!.fill(0)
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      const skip = j - 1 >= i ? cost[i]![j - 1]! : Number.POSITIVE_INFINITY
      const match =
        cost[i - 1]![j - 1]! + Math.abs(few[i - 1]!.position - many[j - 1]!.position)
      cost[i]![j] = Math.min(skip, match)
    }
  }
  const partner = new Array<number>(m).fill(-1)
  for (let i = n, j = m; i > 0; j--) {
    if (j - 1 >= i && cost[i]![j] === cost[i]![j - 1]) continue
    partner[j - 1] = i - 1
    i--
  }
  const aligned: ResolvedStop[] = []
  let floor = 0
  let previous = -1
  for (let j = 0; j < m; j++) {
    const matched = partner[j]!
    if (matched >= 0) {
      const stop = few[matched]!
      aligned.push(stop)
      floor = stop.position
      previous = matched
      continue
    }
    let ceiling = 1
    for (let k = j + 1; k < m; k++) {
      if (partner[k]! >= 0) {
        ceiling = few[partner[k]!]!.position
        break
      }
    }
    const position = Math.min(ceiling, Math.max(floor, many[j]!.position))
    const before = few[previous]
    const after = few[previous + 1]
    let rgb: [number, number, number]
    if (!before) rgb = after ? after.rgb : evaluateResolvedStops(few, position)
    else if (!after) rgb = before.rgb
    else {
      const range = after.position - before.position
      const local = range > 0 ? (position - before.position) / range : 0
      rgb = [
        before.rgb[0] + (after.rgb[0] - before.rgb[0]) * local,
        before.rgb[1] + (after.rgb[1] - before.rgb[1]) * local,
        before.rgb[2] + (after.rgb[2] - before.rgb[2]) * local,
      ]
    }
    aligned.push({ position, rgb })
    floor = position
  }
  return aligned
}

function alignedRamps(from: string, to: string): AlignedRamps {
  let byTarget = alignedRampCache.get(from)
  const cached = byTarget?.get(to)
  if (cached) return cached
  const a = resolveGradientMapStops(parseGradientMapStops(from))
  const b = resolveGradientMapStops(parseGradientMapStops(to))
  const pair: AlignedRamps = { from: a, to: b }
  if (a.length < b.length) pair.from = alignRampStops(a, b)
  else if (b.length < a.length) pair.to = alignRampStops(b, a)
  if (!byTarget) {
    if (alignedRampCache.size >= RAMP_CACHE_LIMIT) alignedRampCache.clear()
    byTarget = new Map()
    alignedRampCache.set(from, byTarget)
  }
  if (byTarget.size >= RAMP_CACHE_LIMIT) byTarget.clear()
  byTarget.set(to, pair)
  return pair
}

function channelHex(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0")
}

export function interpolateGradientMapStops(
  from: string,
  to: string,
  t: number
): string {
  if (!(t > 0) || from === to) return from
  if (t >= 1) return to
  const pair = alignedRamps(from, to)
  let out = "["
  for (let k = 0; k < pair.from.length; k++) {
    const a = pair.from[k]!
    const b = pair.to[k]!
    const position = Math.min(1, Math.max(0, a.position + (b.position - a.position) * t))
    const color =
      channelHex(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t) +
      channelHex(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t) +
      channelHex(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t)
    out += `${k > 0 ? "," : ""}{"position":${Math.round(position * 10000) / 10000},"color":"#${color}"}`
  }
  return `${out}]`
}
