import {
  abs,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  Fn,
  fract,
  Loop,
  length,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  COLOR_MAP_LUT_SIZE,
  DEFAULT_CONNECTED_DOTS_STOPS,
  type GradientMapStop,
  hexToRgb,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "./color-map-lut"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const MODES: Record<string, number> = { blobs: 1, graph: 0, plexus: 2 }
const SHAPES: Record<string, number> = { circle: 0, plus: 2, ring: 3, square: 1 }
const COLOR_MODES: Record<string, number> = { ink: 2, palette: 0, source: 1 }
const BACKGROUNDS: Record<string, number> = { color: 0, image: 1, transparent: 2 }

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

function hash2(p: Node): Node {
  const q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))
  return fract(sin(q).mul(43758.5453))
}

function perceptualLuma(color: Node): Node {
  const luma = clamp(
    dot(vec3(color.r, color.g, color.b), vec3(0.2126, 0.7152, 0.0722)),
    0,
    1
  )
  return select(
    luma.lessThanEqual(float(0.0031308)),
    luma.mul(12.92),
    pow(luma, float(1 / 2.4)).mul(1.055).sub(0.055)
  )
}

function readNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Flat bands: every tone takes the color of its nearest stop. */
function buildBandedColorMap(stops: GradientMapStop[]): Float32Array {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const data = new Float32Array(COLOR_MAP_LUT_SIZE * 4)
  for (let i = 0; i < COLOR_MAP_LUT_SIZE; i++) {
    const t = i / (COLOR_MAP_LUT_SIZE - 1)
    let best = sorted[0] as GradientMapStop
    for (const stop of sorted)
      if (Math.abs(stop.position - t) < Math.abs(best.position - t)) best = stop
    const [r, g, b] = hexToRgb(best.color)
    data.set([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1], i * 4)
  }
  return data
}

type Point = { position: Node; tone: Node; color: Node; present: Node; radius: Node }

export class ConnectedDotsPass extends PassNode {
  private readonly modeUniform: Node
  private readonly spacingUniform: Node
  private readonly jitterUniform: Node
  private readonly shapeUniform: Node
  private readonly minSizeUniform: Node
  private readonly maxSizeUniform: Node
  private readonly cutoffUniform: Node
  private readonly invertUniform: Node
  private readonly linksUniform: Node
  private readonly linkThresholdUniform: Node
  private readonly linkMinUniform: Node
  private readonly linkMaxUniform: Node
  private readonly blobinessUniform: Node
  private readonly rangeUniform: Node
  private readonly lineWidthUniform: Node
  private readonly colorModeUniform: Node
  private readonly inkUniform: Node
  private readonly backgroundModeUniform: Node
  private readonly backgroundUniform: Node
  private readonly driftUniform: Node
  private readonly seedUniform: Node
  private readonly timeUniform: Node
  private readonly documentSizeUniform: Node
  private readonly lut: THREE.DataTexture
  private readonly placeholder = new THREE.Texture()
  private colorNode: Node | null = null
  private stopsKey = ""
  private speed = 0

  constructor(layerId: string) {
    super(layerId)
    this.modeUniform = uniform(0)
    this.spacingUniform = uniform(12)
    this.jitterUniform = uniform(0.85)
    this.shapeUniform = uniform(0)
    this.minSizeUniform = uniform(0.18)
    this.maxSizeUniform = uniform(0.42)
    this.cutoffUniform = uniform(0.05)
    this.invertUniform = uniform(0)
    this.linksUniform = uniform(0.7)
    this.linkThresholdUniform = uniform(0.3)
    this.linkMinUniform = uniform(0.12)
    this.linkMaxUniform = uniform(0.55)
    this.blobinessUniform = uniform(0.5)
    this.rangeUniform = uniform(1.6)
    this.lineWidthUniform = uniform(0.8)
    this.colorModeUniform = uniform(0)
    this.inkUniform = uniform(new THREE.Color("#111111"))
    this.backgroundModeUniform = uniform(0)
    this.backgroundUniform = uniform(new THREE.Color("#c4c4c4"))
    this.driftUniform = uniform(0)
    this.seedUniform = uniform(0)
    this.timeUniform = uniform(0)
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.lut = new THREE.DataTexture(
      new Float32Array(COLOR_MAP_LUT_SIZE * 4),
      COLOR_MAP_LUT_SIZE,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.lut.magFilter = THREE.NearestFilter
    this.lut.minFilter = THREE.NearestFilter
    this.lut.generateMipmaps = false
    this.updateParams({})
    this.rebuildEffectNode()
  }

  override updateLogicalSize(width: number, height: number): void {
    ;(this.documentSizeUniform.value as THREE.Vector2).set(
      Math.max(1, width),
      Math.max(1, height)
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.modeUniform.value = MODES[String(params.mode)] ?? 0
    this.spacingUniform.value = readNumber(params.spacing, 12, 3, 120)
    this.jitterUniform.value = readNumber(params.jitter, 0.85, 0, 1)
    this.shapeUniform.value = SHAPES[String(params.dotShape)] ?? 0
    this.minSizeUniform.value = readNumber(params.minSize, 0.18, 0, 1)
    this.maxSizeUniform.value = readNumber(params.maxSize, 0.42, 0, 1)
    this.cutoffUniform.value = readNumber(params.cutoff, 0.05, 0, 1)
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.linksUniform.value = readNumber(params.links, 0.7, 0, 1)
    this.linkThresholdUniform.value = readNumber(params.linkThreshold, 0.3, 0, 1)
    this.linkMinUniform.value = readNumber(params.linkMin, 0.12, 0, 1)
    this.linkMaxUniform.value = readNumber(params.linkMax, 0.55, 0, 1.5)
    this.blobinessUniform.value = readNumber(params.blobiness, 0.5, 0, 1)
    this.rangeUniform.value = readNumber(params.range, 1.6, 1, 2.9)
    this.lineWidthUniform.value = readNumber(params.lineWidth, 0.8, 0.25, 6)
    this.colorModeUniform.value = COLOR_MODES[String(params.colorMode)] ?? 0
    ;(this.inkUniform.value as THREE.Color).set(
      typeof params.ink === "string" ? params.ink : "#111111"
    )
    this.backgroundModeUniform.value = BACKGROUNDS[String(params.background)] ?? 0
    ;(this.backgroundUniform.value as THREE.Color).set(
      typeof params.backgroundColor === "string" ? params.backgroundColor : "#c4c4c4"
    )
    this.driftUniform.value = readNumber(params.drift, 0, 0, 1)
    this.seedUniform.value = readNumber(params.seed, 0, 0, 999)
    this.speed = readNumber(params.speed, 0, 0, 4)
    const stops =
      typeof params.stops === "string" && params.stops.trim() !== ""
        ? parseGradientMapStops(params.stops)
        : DEFAULT_CONNECTED_DOTS_STOPS
    const key = serializeGradientMapStops(stops)
    if (key !== this.stopsKey) {
      this.stopsKey = key
      ;(this.lut.image.data as Float32Array).set(buildBandedColorMap(stops))
      this.lut.needsUpdate = true
    }
  }

  override needsContinuousRender(): boolean {
    return this.speed > 0.0001 && (this.driftUniform.value as number) > 0
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time * this.speed
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  private point(cell: Node, colorNode: Node): Point {
    const spacing = this.spacingUniform
    const random = hash2(cell.add(this.seedUniform.mul(13.1)))
    const phase = random.mul(6.2831853)
    const drift = vec2(
      sin(this.timeUniform.add(phase.x)),
      cos(this.timeUniform.mul(0.8).add(phase.y))
    ).mul(this.driftUniform.mul(0.35))
    const local = random.sub(0.5).mul(this.jitterUniform).add(0.5).add(drift)
    const position = cell.add(local).mul(spacing)
    const sample = colorNode
      .sample(position.div(this.documentSizeUniform))
      .level(0)
    const tone = perceptualLuma(sample)
    const darkness = select(
      this.invertUniform.greaterThan(0.5),
      tone,
      float(1).sub(tone)
    )
    const present = select(
      darkness.greaterThanEqual(this.cutoffUniform),
      float(1),
      float(0)
    ).mul(select(float(sample.a).greaterThan(0.5), float(1), float(0)))
    const radius = mix(this.minSizeUniform, this.maxSizeUniform, darkness)
      .mul(spacing)
      .mul(0.5)
    return {
      position,
      tone: darkness,
      color: vec3(sample.r, sample.g, sample.b),
      present,
      radius,
    }
  }

  private dotDistance(offset: Node, radius: Node): Node {
    const circle = length(offset).sub(radius)
    const square = max(abs(offset.x), abs(offset.y)).sub(radius)
    const arm = radius.mul(0.32)
    const plus = min(
      max(abs(offset.x).sub(radius), abs(offset.y).sub(arm)),
      max(abs(offset.y).sub(radius), abs(offset.x).sub(arm))
    )
    const ring = abs(length(offset).sub(radius.mul(0.72))).sub(radius.mul(0.28))
    const shape = this.shapeUniform
    return select(
      shape.lessThan(0.5),
      circle,
      select(shape.lessThan(1.5), square, select(shape.lessThan(2.5), plus, ring))
    )
  }

  protected override buildEffectNode(): Node {
    if (!this.lut) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode
    const lutNode = tslTexture(this.lut, vec2(0.5, 0.5))

    return Fn(() => {
      const targetUv = renderTargetUv()
      const pixel = targetUv.mul(this.documentSizeUniform)
      const base = floor(pixel.div(this.spacingUniform))
      const mode = this.modeUniform
      const blobs = mode.greaterThan(0.5).and(mode.lessThan(1.5))
      const plexus = mode.greaterThan(1.5)
      const spacing = this.spacingUniform
      const smooth = select(blobs, this.blobinessUniform.mul(spacing).mul(0.6).add(0.001), float(0.001))
      const sharpness = select(blobs, smooth, float(0.6))

      const field = float(1e5).toVar()
      const weightSum = float(0).toVar()
      const toneSum = float(0).toVar()
      const colorSum = vec3(0).toVar()
      const lineCoverage = float(0).toVar()
      const lineTone = float(0).toVar()
      const lineColor = vec3(0).toVar()

      const addShape = (distance: Node, tone: Node, color: Node, present: Node) => {
        const d = select(present.greaterThan(0.5), distance, float(1e5))
        const h = clamp(float(0.5).add(float(0.5).mul(d.sub(field)).div(smooth)), 0, 1)
        const merged = mix(d, field, h).sub(smooth.mul(h).mul(float(1).sub(h)))
        field.assign(select(blobs, merged, min(field, d)))
        const weight = exp(max(d, float(0)).negate().div(sharpness)).mul(present)
        weightSum.addAssign(weight)
        toneSum.addAssign(tone.mul(weight))
        colorSum.addAssign(color.mul(weight))
      }

      Loop({ start: 0, end: 9, type: "int", name: "centerIndex" }, (centerInputs) => {
        const index = float((centerInputs as unknown as Record<string, Node>).centerIndex)
        const offset = vec2(index.mod(3).sub(1), floor(index.div(3)).sub(1))
        const cellA = base.add(offset)
        const a = this.point(cellA, colorNode)
        const size = select(plexus, a.radius.mul(0.5), a.radius)
        addShape(this.dotDistance(pixel.sub(a.position), size), a.tone, a.color, a.present)
        Loop({ start: 0, end: 8, type: "int", name: "linkIndex" }, (linkInputs) => {
          const k = float((linkInputs as unknown as Record<string, Node>).linkIndex)
          const angle = k.mul(Math.PI / 4)
          const direction = vec2(floor(cos(angle).add(0.5)), floor(sin(angle).add(0.5)))
          const cellB = cellA.add(direction)
          const b = this.point(cellB, colorNode)
          const pairCell = min(cellA, cellB)
          const diagonalKind = select(direction.x.mul(direction.y).lessThan(-0.5), float(5), float(0))
          const pairKey = pairCell.mul(2).add(vec2(abs(direction.x).add(diagonalKind), abs(direction.y)))
          const roll = hash2(pairKey.add(this.seedUniform.mul(7.7))).x
          const darkness = a.tone.add(b.tone).mul(0.5)
          const both = a.present.mul(b.present)
          const chance = smoothstep(
            this.linkThresholdUniform.sub(0.15),
            this.linkThresholdUniform.add(0.15),
            darkness
          ).mul(this.linksUniform)
          const linked = select(roll.lessThan(chance), float(1), float(0)).mul(both)
          const segment = b.position.sub(a.position)
          const span = length(segment)
          const along = clamp(
            dot(pixel.sub(a.position), segment).div(max(dot(segment, segment), float(0.0001))),
            0,
            1
          )
          const distance = length(pixel.sub(a.position).sub(segment.mul(along)))
          const width = mix(this.linkMinUniform, this.linkMaxUniform, pow(darkness, float(1.5)))
            .mul(spacing)
            .mul(0.5)
          const tone = mix(a.tone, b.tone, along)
          const color = mix(a.color, b.color, along)
          addShape(distance.sub(width), tone, color, select(plexus, float(0), linked))
          const reach = this.rangeUniform.mul(spacing)
          const fade = clamp(float(1).sub(span.div(reach)), 0, 1).mul(both)
          const line = float(1)
            .sub(smoothstep(this.lineWidthUniform.mul(0.5).sub(0.6), this.lineWidthUniform.mul(0.5).add(0.6), distance))
            .mul(fade)
            .mul(select(plexus, float(1), float(0)))
          const stronger = line.greaterThan(lineCoverage)
          lineTone.assign(select(stronger, tone, lineTone))
          lineColor.assign(select(stronger, color, lineColor))
          lineCoverage.assign(max(lineCoverage, line))
        })
      })

      const coverage = float(1).sub(smoothstep(-0.7, 0.7, field))
      const tone = toneSum.div(max(weightSum, float(0.0001)))
      const sourceColor = colorSum.div(max(weightSum, float(0.0001)))
      const pick = (toneValue: Node, source: Node): Node => {
        const palette = lutNode.sample(vec2(float(1).sub(toneValue), float(0.5))).level(0)
        const colorMode = this.colorModeUniform
        return select(
          colorMode.lessThan(0.5),
          vec3(palette.r, palette.g, palette.b),
          select(colorMode.lessThan(1.5), source, vec3(this.inkUniform))
        )
      }
      const dotColor = pick(tone, sourceColor)
      const plexusColor = pick(lineTone, lineColor)

      const input = colorNode.sample(targetUv).level(0)
      const backgroundMode = this.backgroundModeUniform
      const backgroundRgb = select(
        backgroundMode.lessThan(0.5),
        vec3(this.backgroundUniform),
        vec3(input.r, input.g, input.b)
      )
      const backgroundAlpha = select(backgroundMode.greaterThan(1.5), float(0), float(1))
      const withLines = mix(backgroundRgb.mul(backgroundAlpha), plexusColor, lineCoverage)
      const linesAlpha = mix(backgroundAlpha, float(1), lineCoverage)
      const premultiplied = mix(withLines, dotColor, coverage)
      const alpha = mix(linesAlpha, float(1), coverage)
      return vec4(premultiplied.div(max(alpha, float(0.0001))), alpha)
    })()
  }

  override dispose(): void {
    this.lut.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
