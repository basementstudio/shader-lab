import type { AnnotationRegion, AnnotationRegions } from "@/renderer/annotations-regions"
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

export type EdgeField = {
  width: number
  height: number
  data: Float32Array
  color?: Float32Array | null
  angle?: Float32Array | null
}

export type AnnotationPlacement = "random" | "edges" | "painted" | "regions"

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
  rotationJitter: number
  alignToEdges: boolean
  scale: number
  stroke: number
  dots: boolean
  connectedDots: boolean
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
      params.placement === "edges" ||
      params.placement === "painted" ||
      params.placement === "regions"
        ? params.placement
        : "random",
    density: number(params.density, 0.5, 0, 1),
    seed: Math.round(number(params.seed, 7, 1, 9999)),
    drift: number(params.drift, 0.3, 0, 1),
    rotationJitter: number(params.rotationJitter, 0, 0, 1),
    alignToEdges: params.alignToEdges === true,
    scale: number(params.scale, 1, 0.4, 2.5),
    stroke: number(params.strokeWidth, 1.5, 0.5, 6),
    dots: params.dots !== false,
    connectedDots: params.connectedDots === true,
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

function hashSeed(...values: number[]): number {
  let hash = 2166136261
  for (const value of values) {
    hash = Math.imul(hash ^ (value | 0), 16777619)
    hash ^= hash >>> 13
  }
  return hash >>> 0
}

function hash01(...values: number[]): number {
  return mulberry32(hashSeed(...values))()
}

export type LayoutContext = {
  aspect: number
  time: number
  edges?: EdgeField | null
  paint?: CellPaintMask | null
  regions?: AnnotationRegions | null
}

type RegionShape = {
  id: number
  x: number
  y: number
  x0: number
  y0: number
  x1: number
  y1: number
  angle: number
  major: number
  minor: number
  background: boolean
  boundary: Float32Array
  headings: Float32Array
}

function regionShape(region: AnnotationRegion, aspect: number): RegionShape {
  const cxx = region.cuu * aspect * aspect
  const cxy = region.cuv * aspect
  const cyy = region.cvv
  const half = (cxx + cyy) / 2
  const spread = Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy)
  const touches =
    Number(region.u0 <= 0.01) +
    Number(region.v0 <= 0.01) +
    Number(region.u1 >= 0.99) +
    Number(region.v1 >= 0.99)
  return {
    id: region.id,
    x: region.u * aspect,
    y: region.v,
    x0: region.u0 * aspect,
    y0: region.v0,
    x1: region.u1 * aspect,
    y1: region.v1,
    angle: 0.5 * Math.atan2(2 * cxy, cxx - cyy),
    major: Math.sqrt(3 * Math.max(0, half + spread)),
    minor: Math.sqrt(3 * Math.max(0, half - spread)),
    background:
      touches >= 3 ||
      region.u1 - region.u0 > 0.8 ||
      region.v1 - region.v0 > 0.8 ||
      (region.u1 - region.u0) * (region.v1 - region.v0) > 0.4,
    boundary: region.boundary,
    headings: Float32Array.from({ length: region.boundary.length / 2 }, (_, k) =>
      Math.atan2(
        (region.boundary[k * 2 + 1] ?? 0) - region.v,
        ((region.boundary[k * 2] ?? 0) - region.u) * aspect
      )
    ),
  }
}

function edgeTangentAt(edges: EdgeField, aspect: number, x: number, y: number): number {
  if (!edges.angle) return 0
  const u = Math.min(0.999, Math.max(0, x / aspect))
  const v = Math.min(0.999, Math.max(0, y))
  return edges.angle[Math.floor(v * edges.height) * edges.width + Math.floor(u * edges.width)] ?? 0
}

function boxReach(hw: number, hh: number, rotation: number): [number, number] {
  if (rotation === 0) return [hw, hh]
  const c = Math.abs(Math.cos(rotation))
  const s = Math.abs(Math.sin(rotation))
  return [hw * c + hh * s, hw * s + hh * c]
}

const FAMILY = { rings: 1, crosses: 2, boxes: 3, dots: 4, labels: 5, connectors: 6, links: 7 } as const

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
  const field =
    config.placement === "edges" || config.placement === "regions"
      ? (context.edges ?? null)
      : null
  const regions =
    config.placement === "regions" && context.regions?.regions.length
      ? context.regions.regions.map((region) => regionShape(region, aspect))
      : null
  const align = config.alignToEdges && field !== null
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
  const accepts = (x: number, y: number, rng: () => number) => {
    if (paint) return paintCoverage(paint, aspect, x, y) > 0.5
    if (edges) {
      const strength = edgeStrength(edges, aspect, x, y)
      return rng() < strength * strength * 4 + 0.01
    }
    return true
  }
  const pick = (rng: () => number = random): [number, number] | null => {
    if (paintedEmpty) return null
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = rng() * aspect
      const y = rng()
      if (paint || edges) {
        if (accepts(x, y, rng)) return [x, y]
        continue
      }
      return [x, y]
    }
    return paint || edges ? null : [rng() * aspect, rng()]
  }
  const spin = (family: number, index: number, x: number, y: number) => {
    let angle = 0
    if (align && edges) angle = edgeTangentAt(edges, aspect, x, y)
    if (config.rotationJitter > 0)
      angle += config.rotationJitter * (hash01(config.seed, family, index) * 2 - 1) * Math.PI * 0.5
    return angle
  }
  const regionRandom = (id: number, family: number, index: number) =>
    mulberry32(hashSeed(config.seed, id, family, index))
  const regionColor = (id: number) =>
    palette > 1 ? Math.floor(hash01(config.seed, id, 99) * palette) : 0
  const cell = 1 / (context.regions?.height ?? 72)
  const snapToBoundary = (
    shape: RegionShape,
    tx: number,
    ty: number,
    rng: () => number
  ): [number, number] => {
    const points = shape.boundary
    const jx = (rng() - 0.5) * cell
    const jy = (rng() - 0.5) * cell
    if (points.length < 2) return [tx, ty]
    let best = Number.POSITIVE_INFINITY
    let bx = tx
    let by = ty
    for (let k = 0; k < points.length; k += 2) {
      const px = (points[k] ?? 0) * aspect
      const py = points[k + 1] ?? 0
      const distance = (px - tx) ** 2 + (py - ty) ** 2
      if (distance < best) {
        best = distance
        bx = px
        by = py
      }
    }
    return [bx + jx, by + jy]
  }
  const boundaryPoint = (shape: RegionShape, rng: () => number): [number, number] => {
    const tx = shape.x0 + rng() * (shape.x1 - shape.x0)
    const ty = shape.y0 + rng() * (shape.y1 - shape.y0)
    return snapToBoundary(shape, tx, ty, rng)
  }
  const eachRegion = (
    count: number,
    family: number,
    make: (shape: RegionShape, rng: () => number, index: number) => void
  ) => {
    if (!regions || count <= 0) return
    const quota = Math.ceil(count / regions.length)
    let made = 0
    for (const shape of regions) {
      for (let j = 0; j < quota && made < count; j++, made++)
        make(shape, regionRandom(shape.id, family, j), made)
    }
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
  const word = (rng: () => number = random) =>
    config.words[Math.floor(rng() * config.words.length)] ?? ""
  const counter = (base: number, rate: number, digits: number) =>
    String(Math.floor(base + t * rate) % 10 ** digits).padStart(digits, "0")

  if (config.targetEnabled) {
    let [tx, ty] = targetPoint(config, aspect)
    if (config.targetSnap && field) {
      const snapped = strongestEdgePoint(field, aspect)
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
    if (config.connectors && regions) {
      const count = Math.round(2 + config.density * 3)
      let made = 0
      for (const shape of regions) {
        if (made >= count) break
        const dx = shape.x - tx
        const dy = shape.y - ty
        const length = Math.hypot(dx, dy)
        if (length < r * 1.2) continue
        made++
        const rng = regionRandom(shape.id, FAMILY.connectors, 0)
        const tone = regionColor(shape.id)
        push({ kind: ANNOTATION_KIND.dashedLine, x: (shape.x + tx) / 2, y: (shape.y + ty) / 2, hw: length / 2, hh: stroke * 4, rotation: Math.atan2(dy, dx), a: stroke, b: 40, color: tone, phase: t * 0.4 })
        push({ kind: ANNOTATION_KIND.dot, x: shape.x, y: shape.y, hw: stroke * 1.4, hh: stroke * 1.4, rotation: 0, a: 0, b: 0, color: tone, phase: 0 })
        if (config.labels) text(word(rng), shape.x + 0.012 * s, shape.y - 0.012 * s, tone)
      }
    } else if (config.connectors) {
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
      let x = point[0] + dx
      let y = point[1] + dy
      if (paint && paintCoverage(paint, aspect, x, y) <= 0.5) {
        x = point[0]
        y = point[1]
      }
      make(x, y, i)
    }
  }

  const layoutRegionFamilies = (shapes: RegionShape[]) => {
    const jitter = (family: number, index: number) =>
      config.rotationJitter > 0
        ? config.rotationJitter * (hash01(config.seed, family, index, 7) * 2 - 1) * Math.PI * 0.5
        : 0
    if (config.dots)
      eachRegion(Math.round(config.density * 64), FAMILY.dots, (shape, rng) => {
        const [x, y] = boundaryPoint(shape, rng)
        const [dx, dy] = drift(elements.length)
        const r = stroke * (0.9 + rng() * 1.8)
        push({ kind: ANNOTATION_KIND.dot, x: x + dx, y: y + dy, hw: r, hh: r, rotation: 0, a: 0, b: 0, color: regionColor(shape.id), phase: 0 })
      })
    if (config.rings) {
      const count = Math.min(shapes.length, Math.round(1 + config.density * 6))
      for (let i = 0; i < count; i++) {
        const shape = shapes[i]!
        const rng = regionRandom(shape.id, FAMILY.rings, 0)
        const [dx, dy] = drift(elements.length)
        const r = Math.min(0.12 * s, Math.max(0.012 * s, Math.sqrt(shape.major * shape.minor) * 0.9))
        const dashed = rng() < 0.6
        const rotation = (align ? shape.angle : 0) + jitter(FAMILY.rings, shape.id)
        push({ kind: dashed ? ANNOTATION_KIND.dashedRing : ANNOTATION_KIND.ring, x: shape.x + dx, y: shape.y + dy, hw: r, hh: r, rotation, a: stroke, b: 16 + Math.floor(rng() * 24), color: regionColor(shape.id), phase: t * (0.1 + (i % 3) * 0.08) * (i % 2 ? 1 : -1) })
      }
    }
    if (config.crosses)
      eachRegion(Math.round(1 + config.density * 9), FAMILY.crosses, (shape, rng, index) => {
        const reticle = rng() < 0.5
        const centered = rng() < 0.35
        const [x, y] = centered ? [shape.x, shape.y] : boundaryPoint(shape, rng)
        const [dx, dy] = drift(elements.length)
        const r = (0.006 + rng() * 0.012) * s
        const rotation = (align ? shape.angle : 0) + jitter(FAMILY.crosses, shape.id * 64 + index)
        push({ kind: reticle ? ANNOTATION_KIND.crosshair : ANNOTATION_KIND.cross, x: x + dx, y: y + dy, hw: r, hh: r, rotation, a: stroke, b: 0, color: regionColor(shape.id), phase: 0 })
      })
    if (config.boxes) {
      const count = Math.round(1 + config.density * 5)
      let made = 0
      for (const shape of shapes) {
        if (made >= count) break
        if (shape.background) continue
        made++
        const rng = regionRandom(shape.id, FAMILY.boxes, 0)
        const roll = rng()
        let kind: number = ANNOTATION_KIND.box
        if (roll < 0.4) kind = ANNOTATION_KIND.dashedBox
        else if (roll < 0.7) kind = ANNOTATION_KIND.brackets
        const margin = 0.006 * s
        const [dx, dy] = drift(elements.length)
        let x = (shape.x0 + shape.x1) / 2
        let y = (shape.y0 + shape.y1) / 2
        let hw = (shape.x1 - shape.x0) / 2 + margin
        let hh = (shape.y1 - shape.y0) / 2 + margin
        let rotation = jitter(FAMILY.boxes, shape.id)
        if (align) {
          x = shape.x
          y = shape.y
          hw = shape.major + margin
          hh = shape.minor + margin
          rotation += shape.angle
        }
        x += dx
        y += dy
        const color = regionColor(shape.id)
        push({ kind, x, y, hw, hh, rotation, a: stroke, b: kind === ANNOTATION_KIND.brackets ? 0.3 : 24, color, phase: t * 0.2 * (made % 2 ? 1 : -1) })
        const [rx, ry] = boxReach(hw, hh, rotation)
        if (config.labels) text(`${word(rng)} ${String(shape.id % 100).padStart(2, "0")}`, x - rx, y - ry - ANNOTATION_TEXT_HEIGHT * s * 0.9, color)
      }
    }
    if (config.labels) {
      const count = Math.min(shapes.length, Math.round(config.density * 5))
      for (let i = 0; i < count; i++) {
        const shape = shapes[shapes.length - 1 - i]!
        const rng = regionRandom(shape.id, FAMILY.labels, 0)
        const [x, y] = boundaryPoint(shape, rng)
        const [dx, dy] = drift(elements.length + i)
        text(word(rng), x + dx + 0.01 * s, y + dy - 0.01 * s, regionColor(shape.id))
      }
    }
  }

  if (regions) layoutRegionFamilies(regions)
  if (config.dots && !regions)
    scatter(Math.round(config.density * 36), (x, y) => {
      const r = stroke * (0.9 + random() * 1.8)
      push({ kind: ANNOTATION_KIND.dot, x, y, hw: r, hh: r, rotation: 0, a: 0, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.rings && !regions)
    scatter(Math.round(1 + config.density * 6), (x, y, i) => {
      const r = (0.012 + random() * 0.05) * s
      const dashed = random() < 0.6
      const rotation = spin(FAMILY.rings, i, x, y)
      push({ kind: dashed ? ANNOTATION_KIND.dashedRing : ANNOTATION_KIND.ring, x, y, hw: r, hh: r, rotation, a: stroke, b: 10 + Math.floor(random() * 22), color: pickColor(), phase: t * (0.1 + (i % 3) * 0.08) * (i % 2 ? 1 : -1) })
      if (random() < 0.5) push({ kind: ANNOTATION_KIND.cross, x, y, hw: r * 0.18, hh: r * 0.18, rotation, a: stroke, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.crosses && !regions)
    scatter(Math.round(1 + config.density * 9), (x, y, i) => {
      const r = (0.006 + random() * 0.012) * s
      const kind = random() < 0.5 ? ANNOTATION_KIND.cross : ANNOTATION_KIND.crosshair
      push({ kind, x, y, hw: r, hh: r, rotation: spin(FAMILY.crosses, i, x, y), a: stroke, b: 0, color: pickColor(), phase: 0 })
    })
  if (config.boxes && !regions)
    scatter(Math.round(1 + config.density * 5), (x, y, i) => {
      const hw = (0.02 + random() * 0.07) * s
      const hh = (0.015 + random() * 0.05) * s
      const roll = random()
      let kind: number = ANNOTATION_KIND.box
      if (roll < 0.4) kind = ANNOTATION_KIND.dashedBox
      else if (roll < 0.7) kind = ANNOTATION_KIND.brackets
      const color = pickColor()
      const rotation = spin(FAMILY.boxes, i, x, y)
      push({ kind, x, y, hw, hh, rotation, a: stroke, b: kind === ANNOTATION_KIND.brackets ? 0.3 : 24, color, phase: t * 0.2 * (i % 2 ? 1 : -1) })
      const [rx, ry] = boxReach(hw, hh, rotation)
      if (config.labels) text(`${word()} ${counter(config.seed * (i + 1), 0.5, 2)}`, x - rx, y - ry - ANNOTATION_TEXT_HEIGHT * s * 0.9, color)
    })
  if (config.labels && !regions)
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

  if (config.connectedDots) {
    const clusterRandom = mulberry32(config.seed * 7919 + 101)
    const clusters = Math.round(1 + config.density * 5)
    const linkStroke = stroke * 0.7
    const constellation = (nodes: [number, number][], color: number, rng: () => number, index: number) => {
      if (nodes.length < 2) return
      const linked = new Set<number>()
      const link = (i: number, j: number) => {
        const key = Math.min(i, j) * 64 + Math.max(i, j)
        if (linked.has(key)) return
        linked.add(key)
        const [ax, ay] = nodes[i]!
        const [bx, by] = nodes[j]!
        const dx = bx - ax
        const dy = by - ay
        push({ kind: ANNOTATION_KIND.line, x: (ax + bx) / 2, y: (ay + by) / 2, hw: Math.hypot(dx, dy) / 2, hh: linkStroke, rotation: Math.atan2(dy, dx), a: linkStroke, b: 0, color, phase: 0 })
      }
      const inTree = [0]
      const rest = nodes.map((_, i) => i).slice(1)
      while (rest.length) {
        let best = Number.POSITIVE_INFINITY
        let from = 0
        let to = 0
        for (const i of inTree) {
          for (const [k, j] of rest.entries()) {
            const distance = (nodes[i]![0] - nodes[j]![0]) ** 2 + (nodes[i]![1] - nodes[j]![1]) ** 2
            if (distance < best) {
              best = distance
              from = i
              to = k
            }
          }
        }
        const next = rest.splice(to, 1)[0]!
        link(from, next)
        inTree.push(next)
      }
      for (const [i, node] of nodes.entries()) {
        if (rng() > 0.3) continue
        let first = -1
        let second = -1
        let firstDistance = Number.POSITIVE_INFINITY
        let secondDistance = Number.POSITIVE_INFINITY
        for (const [j, other] of nodes.entries()) {
          if (i === j) continue
          const distance = (node[0] - other[0]) ** 2 + (node[1] - other[1]) ** 2
          if (distance < firstDistance) {
            second = first
            secondDistance = firstDistance
            first = j
            firstDistance = distance
          } else if (distance < secondDistance) {
            second = j
            secondDistance = distance
          }
        }
        if (second >= 0) link(i, second)
      }
      for (const [i, [x, y]] of nodes.entries()) {
        const r = stroke * (i === 0 ? 2.2 : 1.4 + rng() * 0.9)
        push({ kind: ANNOTATION_KIND.dot, x, y, hw: r, hh: r, rotation: 0, a: 0, b: 0, color, phase: 0 })
      }
      const [hx, hy] = nodes[0]!
      push({ kind: ANNOTATION_KIND.ring, x: hx, y: hy, hw: stroke * 5, hh: stroke * 5, rotation: 0, a: linkStroke, b: 0, color, phase: 0 })
      if (config.labels && rng() < 0.6) {
        const code = String(Math.floor(hash01(config.seed, index, 31) * 1000)).padStart(3, "0")
        text(`${word(rng)} ${code}`, hx + stroke * 6, hy - stroke * 6, color, "left", 0.8)
      }
    }
    if (regions) {
      eachRegion(clusters, FAMILY.links, (shape, rng, index) => {
        const [ax, ay] = boundaryPoint(shape, rng)
        const reach = (0.08 + rng() * 0.08) * s
        const [dx, dy] = drift(elements.length)
        const nodes: [number, number][] = [[ax + dx, ay + dy]]
        const size = 6 + Math.floor(rng() * 5)
        for (let n = 1; n < size; n++) {
          const angle = rng() * Math.PI * 2
          const radius = reach * (0.25 + (0.75 * n) / size)
          const [x, y] = snapToBoundary(shape, ax + Math.cos(angle) * radius, ay + Math.sin(angle) * radius, rng)
          nodes.push([x + (rng() - 0.5) * cell * 2 + dx, y + (rng() - 0.5) * cell * 2 + dy])
        }
        constellation(nodes, regionColor(shape.id), rng, shape.id * 64 + index)
      })
    } else {
      for (let c = 0; c < clusters; c++) {
        const center = pick(clusterRandom)
        if (!center) continue
        const reach = (0.06 + clusterRandom() * 0.06) * s
        const size = 6 + Math.floor(clusterRandom() * 5)
        const spacing = reach * 0.3
        const [dx, dy] = drift(elements.length)
        const nodes: [number, number][] = [[center[0] + dx, center[1] + dy]]
        for (let n = 1; n < size; n++) {
          for (let attempt = 0; attempt < 16; attempt++) {
            const angle = clusterRandom() * Math.PI * 2
            const radius = Math.sqrt(clusterRandom()) * reach
            const x = center[0] + Math.cos(angle) * radius
            const y = center[1] + Math.sin(angle) * radius
            if (!accepts(x, y, clusterRandom)) continue
            if (nodes.some(([nx, ny]) => Math.hypot(nx - dx - x, ny - dy - y) < spacing)) continue
            nodes.push([x + dx, y + dy])
            break
          }
        }
        constellation(nodes, palette > 1 ? Math.floor(clusterRandom() * palette) : 0, clusterRandom, c)
      }
    }
  }

  return { elements, glyphs }
}
