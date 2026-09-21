import { glyphIndex } from "@/renderer/blob-label-atlas"
import { type CellPaintMask, decodeCellPaintMask } from "@/renderer/cell-paint-mask"
import type { LayerParameterValues } from "@/types/editor"

export const ANNOTATION_KIND = {
  dot: 0,
  ring: 1,
  dashedRing: 2,
  crosshair: 3,
  cross: 4,
  box: 5,
  dashedBox: 6,
  brackets: 7,
  line: 8,
  dashedLine: 9,
  ticks: 10,
  gradientBar: 11,
} as const

export const MAX_ANNOTATION_ELEMENTS = 320
export const MAX_ANNOTATION_GLYPHS = 1024
export const ANNOTATION_PALETTE_SIZE = 5
export const ANNOTATION_TEXT_HEIGHT = 1 / 60

export type AnnotationElement = {
  kind: number
  x: number
  y: number
  hw: number
  hh: number
  rotation: number
  a: number
  b: number
  color: number
  phase: number
}

export type AnnotationGlyph = {
  x: number
  y: number
  hw: number
  hh: number
  glyph: number
  color: number
}

export type EdgeField = { width: number; height: number; data: Float32Array }

export type AnnotationPlacement = "random" | "edges" | "painted"

export type AnnotationPreset = {
  id: string
  label: string
  words: string
  blocks: string
}

export const ANNOTATION_PRESETS: AnnotationPreset[] = [
  {
    id: "instrument",
    label: "Instrument",
    words: "NOT FOUND\nSCAN\nLOCK\n14.3\n0.72\nE\nREF\nSIGNAL",
    blocks:
      "START  1.000 MHz\nSTOP   403.000 MHz\n\nOP-ID : STA-\nOPS-221 LOC : [REDACTED]",
  },
  {
    id: "surveillance",
    label: "Surveillance",
    words: "PERSON\nTARGET\nUNKNOWN\nTRACKING\nLOST\n98%\n61%",
    blocks: "CAM 04  NE GATE\nREC  00:14:52\n\nSUBJECTS 03\nCONF 0.87",
  },
  {
    id: "scientific",
    label: "Scientific",
    words: "SAMPLE\nA1\nB7\nDELTA\n0.034\n12 um\nNULL",
    blocks: "SPECIMEN 0419\nMAG 40X\n\nEXPOSURE 1/250\nGAIN +6 dB",
  },
  {
    id: "minimal",
    label: "Minimal",
    words: "01\n02\n03\nX\nY",
    blocks: "N 41.38\nW 2.17",
  },
]

export type AnnotationConfig = {
  placement: AnnotationPlacement
  density: number
  seed: number
  drift: number
  scale: number
  stroke: number
  dots: boolean
  rings: boolean
  crosses: boolean
  boxes: boolean
  rulers: boolean
  connectors: boolean
  labels: boolean
  metadata: boolean
  targetEnabled: boolean
  targetCenter: [number, number]
  targetSize: number
  targetSnap: boolean
  words: string[]
  blocks: string[][]
  textSize: number
  colorMode: "mono" | "palette"
  colors: string[]
  paint: string
}

function number(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

function lines(value: unknown, fallback: string): string[] {
  const text = typeof value === "string" ? value : fallback
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function blocks(value: unknown, fallback: string): string[][] {
  const text = typeof value === "string" ? value : fallback
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
    )
    .filter((block) => block.length > 0)
    .slice(0, 4)
}

const HEX = /^#[0-9a-f]{6}$/i

function colorOf(entry: unknown): unknown {
  if (typeof entry === "string") return entry
  if (entry && typeof entry === "object") return (entry as { color?: unknown }).color
  return null
}

export function parseAnnotationColors(value: unknown, mono: string): string[] {
  let raw: unknown = value
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value)
    } catch {
      raw = null
    }
  }
  const colors: string[] = []
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const color = colorOf(entry)
      if (typeof color === "string" && HEX.test(color))
        colors.push(color.toLowerCase())
      if (colors.length >= ANNOTATION_PALETTE_SIZE) break
    }
  }
  return colors.length ? colors : [mono]
}

export function parseAnnotationConfig(
  params: LayerParameterValues
): AnnotationConfig {
  const preset =
    ANNOTATION_PRESETS.find((entry) => entry.id === params.textPreset) ??
    ANNOTATION_PRESETS[0]!
  const mono =
    typeof params.color === "string" && HEX.test(params.color)
      ? params.color.toLowerCase()
      : "#d7d2c8"
  const center = Array.isArray(params.targetCenter) ? params.targetCenter : []
  return {
    placement:
      params.placement === "edges" || params.placement === "painted"
        ? params.placement
        : "random",
    density: number(params.density, 0.5, 0, 1),
    seed: Math.round(number(params.seed, 7, 1, 9999)),
    drift: number(params.drift, 0.3, 0, 1),
    scale: number(params.scale, 1, 0.4, 2.5),
    stroke: number(params.strokeWidth, 1.5, 0.5, 6),
    dots: params.dots !== false,
    rings: params.rings !== false,
    crosses: params.crosses !== false,
    boxes: params.boxes !== false,
    rulers: params.rulers !== false,
    connectors: params.connectors !== false,
    labels: params.labels !== false,
    metadata: params.metadata !== false,
    targetEnabled: params.targetEnabled !== false,
    targetCenter: [number(center[0], -0.2, -3, 3), number(center[1], -0.1, -3, 3)],
    targetSize: number(params.targetSize, 0.35, 0.05, 2),
    targetSnap: params.targetSnap === true,
    words: lines(params.labelList, preset.words),
    blocks: blocks(params.metadataText, preset.blocks),
    textSize: number(params.textSize, 1, 0.5, 3),
    colorMode: params.colorMode === "palette" ? "palette" : "mono",
    colors:
      params.colorMode === "palette"
        ? parseAnnotationColors(params.colors, mono)
        : [mono],
    paint: typeof params.paintMask === "string" ? params.paintMask : "",
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type LayoutContext = {
  aspect: number
  time: number
  edges?: EdgeField | null
  paint?: CellPaintMask | null
}

type Layout = { elements: AnnotationElement[]; glyphs: AnnotationGlyph[] }

export function targetPoint(config: AnnotationConfig, aspect: number): [number, number] {
  const unit = Math.min(aspect, 1)
  return [aspect / 2 + config.targetCenter[0] * unit, 0.5 + config.targetCenter[1] * unit]
}

function paintCoverage(paint: CellPaintMask, aspect: number, x: number, y: number): number {
  const unit = Math.min(aspect, 1)
  const u = (x - aspect / 2) / unit / paint.width + 0.5
  const v = (y - 0.5) / unit / paint.height + 0.5
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0
  const px = Math.floor(u * 512)
  const py = Math.floor(v * 512)
  return (paint.data[py * 512 + px] ?? 0) / 255
}

function edgeStrength(edges: EdgeField, aspect: number, x: number, y: number): number {
  const u = Math.min(0.999, Math.max(0, x / aspect))
  const v = Math.min(0.999, Math.max(0, y))
  const ex = Math.floor(u * edges.width)
  const ey = Math.floor(v * edges.height)
  return edges.data[ey * edges.width + ex] ?? 0
}

export function strongestEdgePoint(edges: EdgeField, aspect: number): [number, number] | null {
  let best = -1
  let index = -1
  for (let i = 0; i < edges.data.length; i++) {
    const value = edges.data[i] ?? 0
    if (value > best) {
      best = value
      index = i
    }
  }
  if (index < 0 || best <= 0) return null
  const ex = index % edges.width
  const ey = Math.floor(index / edges.width)
  return [((ex + 0.5) / edges.width) * aspect, (ey + 0.5) / edges.height]
}

export function layoutAnnotations(config: AnnotationConfig, context: LayoutContext): Layout {
  const aspect = Math.max(0.1, context.aspect)
  const elements: AnnotationElement[] = []
  const glyphs: AnnotationGlyph[] = []
  const random = mulberry32(config.seed * 7919 + 17)
  const paint =
    config.placement === "painted" && config.paint
      ? (context.paint ?? decodeCellPaintMask(config.paint))
      : null
  const edges = config.placement === "edges" ? (context.edges ?? null) : null
  const palette = config.colors.length
  const pickColor = () => (palette > 1 ? Math.floor(random() * palette) : 0)
  const stroke = config.stroke / 1080
  const s = config.scale
  const t = context.time
  const push = (element: AnnotationElement) => {
    if (elements.length < MAX_ANNOTATION_ELEMENTS) elements.push(element)
  }
  const drift = (index: number): [number, number] => {
    if (config.drift <= 0) return [0, 0]
    const amount = config.drift * 0.03
    return [
      amount * Math.sin(t * 0.6 + index * 1.7 + config.seed * 0.11),
      amount * Math.cos(t * 0.45 + index * 2.3 + config.seed * 0.07),
    ]
  }
  const paintedEmpty = config.placement === "painted" && !paint
  const pick = (): [number, number] | null => {
    if (paintedEmpty) return null
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = random() * aspect
      const y = random()
      if (paint) {
        if (paintCoverage(paint, aspect, x, y) > 0.5) return [x, y]
        continue
      }
      if (edges) {
        const strength = edgeStrength(edges, aspect, x, y)
        if (random() < strength * strength * 4 + 0.01) return [x, y]
        continue
      }
      return [x, y]
    }
    return paint || edges ? null : [random() * aspect, random()]
  }
  const text = (
    value: string,
    x: number,
    y: number,
    color: number,
    align: "left" | "center" | "right" = "left",
    size = 1
  ) => {
    const hh = (ANNOTATION_TEXT_HEIGHT * config.textSize * s * size) / 2
    const hw = hh * 0.55
    const chars = [...value.toUpperCase()]
    const width = chars.length * hw * 2
    let cursor = x
    if (align === "center") cursor = x - width / 2
    else if (align === "right") cursor = x - width
    for (const char of chars) {
      const glyph = glyphIndex(char)
      if (glyph >= 0 && glyphs.length < MAX_ANNOTATION_GLYPHS)
        glyphs.push({ x: cursor + hw, y, hw, hh, glyph, color })
      cursor += hw * 2
    }
    return { width, height: hh * 2 }
  }
  const word = () => config.words[Math.floor(random() * config.words.length)] ?? ""
  const counter = (base: number, rate: number, digits: number) =>
    String(Math.floor(base + t * rate) % 10 ** digits).padStart(digits, "0")

  if (config.targetEnabled) {
    let [tx, ty] = targetPoint(config, aspect)
    if (config.targetSnap && edges) {
      const snapped = strongestEdgePoint(edges, aspect)
      if (snapped) [tx, ty] = snapped
    }
    const r = config.targetSize * Math.min(aspect, 1) * 0.5 * s
    const color = pickColor()
    const spin = t * 0.15
    push({ kind: ANNOTATION_KIND.crosshair, x: tx, y: ty, hw: r * 0.16, hh: r * 0.16, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.ring, x: tx, y: ty, hw: r * 0.1, hh: r * 0.1, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.ring, x: tx, y: ty, hw: r, hh: r, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.dashedRing, x: tx + r * 0.08, y: ty - r * 0.05, hw: r * 1.12, hh: r * 1.12, rotation: 0, a: stroke, b: 28, color, phase: spin })
    push({ kind: ANNOTATION_KIND.ring, x: tx - r * 0.35, y: ty + r * 0.55, hw: r * 0.42, hh: r * 0.42, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.cross, x: tx - r * 0.35, y: ty + r * 0.55, hw: r * 0.05, hh: r * 0.05, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.dashedRing, x: tx + r * 0.55, y: ty + r * 0.6, hw: r * 0.3, hh: r * 0.3, rotation: 0, a: stroke, b: 16, color, phase: -spin * 1.3 })
    push({ kind: ANNOTATION_KIND.dot, x: tx + r * 0.55, y: ty + r * 0.6, hw: stroke * 1.6, hh: stroke * 1.6, rotation: 0, a: 0, b: 0, color, phase: 0 })
    const angle = (config.seed * 37 + Math.floor(t * 4)) % 3600
    text(`-{0}${String(angle).padStart(4, "0")}°`, tx - r * 0.15, ty - r * 0.5, color)
    text((config.seed % 90 / 10 + 10).toFixed(1), tx + r * 1.25, ty - r * 0.85, color)
    if (config.connectors) {
      const count = Math.round(2 + config.density * 3)
      for (let i = 0; i < count; i++) {
        const point = pick()
        if (!point) continue
        const [px, py] = point
        const dx = px - tx
        const dy = py - ty
        const length = Math.hypot(dx, dy)
        if (length < r * 1.2) continue
        push({ kind: ANNOTATION_KIND.dashedLine, x: (px + tx) / 2, y: (py + ty) / 2, hw: length / 2, hh: stroke * 4, rotation: Math.atan2(dy, dx), a: stroke, b: 40, color: pickColor(), phase: t * 0.4 })
        push({ kind: ANNOTATION_KIND.dot, x: px, y: py, hw: stroke * 1.4, hh: stroke * 1.4, rotation: 0, a: 0, b: 0, color, phase: 0 })
        if (config.labels) text(word(), px + 0.012 * s, py - 0.012 * s, color)
      }
    }
  }

  const scatter = (count: number, make: (x: number, y: number, index: number) => void) => {
    for (let i = 0; i < count; i++) {
      const point = pick()
      if (!point) continue
      const [dx, dy] = drift(elements.length + i)
      make(point[0] + dx, point[1] + dy, i)
    }
  }

  if (config.dots)
    scatter(Math.round(config.density * 36), (x, y) => {
      const r = stroke * (0.9 + random() * 1.8)
      push({ kind: ANNOTATION_KIND.dot, x, y, hw: r, hh: r, rotation: 0, a: 0, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.rings)
    scatter(Math.round(1 + config.density * 6), (x, y, i) => {
      const r = (0.012 + random() * 0.05) * s
      const dashed = random() < 0.6
      push({ kind: dashed ? ANNOTATION_KIND.dashedRing : ANNOTATION_KIND.ring, x, y, hw: r, hh: r, rotation: 0, a: stroke, b: 10 + Math.floor(random() * 22), color: pickColor(), phase: t * (0.1 + (i % 3) * 0.08) * (i % 2 ? 1 : -1) })
      if (random() < 0.5) push({ kind: ANNOTATION_KIND.cross, x, y, hw: r * 0.18, hh: r * 0.18, rotation: 0, a: stroke, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.crosses)
    scatter(Math.round(1 + config.density * 9), (x, y) => {
      const r = (0.006 + random() * 0.012) * s
      const kind = random() < 0.5 ? ANNOTATION_KIND.cross : ANNOTATION_KIND.crosshair
      push({ kind, x, y, hw: r, hh: r, rotation: 0, a: stroke, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.boxes)
    scatter(Math.round(1 + config.density * 5), (x, y, i) => {
      const hw = (0.02 + random() * 0.07) * s
      const hh = (0.015 + random() * 0.05) * s
      const roll = random()
      let kind: number = ANNOTATION_KIND.box
      if (roll < 0.4) kind = ANNOTATION_KIND.dashedBox
      else if (roll < 0.7) kind = ANNOTATION_KIND.brackets
      const color = pickColor()
      push({ kind, x, y, hw, hh, rotation: 0, a: stroke, b: kind === ANNOTATION_KIND.brackets ? 0.3 : 24, color, phase: t * 0.2 * (i % 2 ? 1 : -1) })
      if (config.labels) text(`${word()} ${counter(config.seed * (i + 1), 0.5, 2)}`, x - hw, y - hh - ANNOTATION_TEXT_HEIGHT * s * 0.9, color)
    })
  if (config.labels)
    scatter(Math.round(config.density * 5), (x, y) => {
      text(word(), x, y, pickColor())
    })

  if (config.rulers) {
    const color = pickColor()
    const rx = aspect - 0.06 * s
    const ry = 0.08
    push({ kind: ANNOTATION_KIND.ticks, x: rx - 0.09 * s, y: ry, hw: 0.09 * s, hh: 0.012 * s, rotation: 0, a: stroke, b: 12, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.dashedRing, x: rx - 0.235 * s, y: ry - 0.02 * s, hw: 0.005 * s, hh: 0.005 * s, rotation: 0, a: stroke, b: 6, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.dashedRing, x: rx + 0.01 * s, y: ry - 0.02 * s, hw: 0.005 * s, hh: 0.005 * s, rotation: 0, a: stroke, b: 6, color, phase: 0 })
    const label = counter(config.seed * 13, 2, 3)
    const box = text(label, rx - 0.115 * s, ry - 0.02 * s, color, "center", 0.9)
    push({ kind: ANNOTATION_KIND.box, x: rx - 0.115 * s, y: ry - 0.02 * s, hw: box.width / 2 + 0.008 * s, hh: box.height / 2 + 0.005 * s, rotation: 0, a: stroke, b: 0, color, phase: 0 })
    push({ kind: ANNOTATION_KIND.ticks, x: 0.02 * s, y: 0.62, hw: 0.14 * s, hh: 0.012 * s, rotation: Math.PI / 2, a: stroke, b: 14, color, phase: 0 })
    text("E", 0.052 * s, 0.7, color)
    text(((config.seed % 40) / 10 + 10).toFixed(1), 0.09 * s, 0.3, color)
  }

  if (config.metadata) {
    const color = pickColor()
    const lineHeight = ANNOTATION_TEXT_HEIGHT * config.textSize * s * 1.55
    const [first, second] = config.blocks
    if (first) {
      for (const [i, line] of first.entries())
        text(line, 0.09 * s, 0.94 - (first.length - 1 - i) * lineHeight, color)
      push({ kind: ANNOTATION_KIND.gradientBar, x: 0.09 * s + 0.06 * s, y: 0.94 - first.length * lineHeight - 0.02 * s, hw: 0.06 * s, hh: 0.006 * s, rotation: 0, a: 0, b: 0, color, phase: 0 })
    }
    if (second) {
      for (const [i, line] of second.entries())
        text(line, aspect * 0.56, 0.94 - (second.length - 1 - i) * lineHeight, color)
    }
    const status = config.words[0] ?? "NOT FOUND"
    const tag = text(status, 0.15 * s, 0.1, color, "center", 0.9)
    push({ kind: ANNOTATION_KIND.box, x: 0.15 * s, y: 0.1, hw: tag.width / 2 + 0.01 * s, hh: tag.height / 2 + 0.006 * s, rotation: 0, a: stroke, b: 0, color, phase: 0 })
  }

  return { elements, glyphs }
}
