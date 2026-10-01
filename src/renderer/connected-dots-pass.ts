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
  If,
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
} from "@/renderer/color-map-lut"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const MODES: Record<string, number> = { blobs: 1, graph: 0, mesh: 3, plexus: 2 }
const SHAPES: Record<string, number> = { circle: 0, plus: 2, ring: 3, square: 1 }
const COLOR_MODES: Record<string, number> = { ink: 2, palette: 0, source: 1 }
const BACKGROUNDS: Record<string, number> = { color: 0, image: 1, transparent: 2 }
const LINK_DIRECTIONS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const

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

type Site = { uv: Node; tone: Node; present: Node }
type Point = Site & { position: Node; color: Node }

const SITE_MARGIN = 2
const SNAP_STEPS = 4
const MAX_EDGE_TEXTURE = 8192
const SNAP_FLOOR = 0.08
const SNAP_RAMP = 0.15
const SNAP_REACH = 5
const SNAP_RIDGE = 3

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
  private readonly fillUniform: Node
  private readonly wireUniform: Node
  private readonly wireColorUniform: Node
  private readonly seedUniform: Node
  private readonly edgeSnapUniform: Node
  private edgeSnapRequested = 0
  private readonly timeUniform: Node
  private readonly documentSizeUniform: Node
  private readonly siteGridUniform: Node
  private readonly lut: THREE.DataTexture
  private readonly placeholder = new THREE.Texture()
  private readonly siteTarget: THREE.WebGLRenderTarget
  private readonly siteMaterial: THREE.MeshBasicNodeMaterial
  private readonly siteScene: THREE.Scene
  private readonly siteGeometry: THREE.PlaneGeometry
  private readonly siteInputNode: Node
  private readonly edgeTarget: THREE.WebGLRenderTarget
  private readonly edgeMaterial: THREE.MeshBasicNodeMaterial
  private readonly edgeScene: THREE.Scene
  private readonly edgeInputNode: Node
  private colorNode: Node | null = null
  private stopsKey = ""
  private meshShader = false
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
    this.fillUniform = uniform(1)
    this.wireUniform = uniform(0.6)
    this.wireColorUniform = uniform(new THREE.Color("#ffffff"))
    this.seedUniform = uniform(0)
    this.edgeSnapUniform = uniform(0)
    this.timeUniform = uniform(0)
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.siteGridUniform = uniform(new THREE.Vector2(1, 1))
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
    this.siteTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
      type: THREE.FloatType,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    })
    this.edgeTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      format: THREE.RedFormat,
      generateMipmaps: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    })
    this.siteInputNode = tslTexture(this.placeholder, renderTargetUv())
    this.edgeInputNode = tslTexture(this.placeholder, renderTargetUv())
    this.siteMaterial = new THREE.MeshBasicNodeMaterial()
    this.siteMaterial.blending = THREE.NoBlending
    ;(this.siteMaterial as unknown as { fragmentNode: Node }).fragmentNode = this.buildSiteNode()
    this.siteGeometry = new THREE.PlaneGeometry(2, 2)
    const siteMesh = new THREE.Mesh(this.siteGeometry, this.siteMaterial)
    siteMesh.frustumCulled = false
    this.siteScene = new THREE.Scene()
    this.siteScene.add(siteMesh)
    this.edgeMaterial = new THREE.MeshBasicNodeMaterial()
    this.edgeMaterial.blending = THREE.NoBlending
    ;(this.edgeMaterial as unknown as { fragmentNode: Node }).fragmentNode = this.buildEdgeNode()
    const edgeMesh = new THREE.Mesh(this.siteGeometry, this.edgeMaterial)
    edgeMesh.frustumCulled = false
    this.edgeScene = new THREE.Scene()
    this.edgeScene.add(edgeMesh)
    this.updateParams({})
    this.rebuildEffectNode()
  }

  override updateLogicalSize(width: number, height: number): void {
    ;(this.documentSizeUniform.value as THREE.Vector2).set(
      Math.max(1, width),
      Math.max(1, height)
    )
    this.syncSiteGrid()
  }

  private syncSiteGrid(): void {
    if (!this.siteTarget) return
    const size = this.documentSizeUniform.value as THREE.Vector2
    const spacing = this.spacingUniform.value as number
    const columns = Math.ceil((Math.floor(size.x / spacing) + SITE_MARGIN * 2 + 2) / 8) * 8
    const rows = Math.ceil((Math.floor(size.y / spacing) + SITE_MARGIN * 2 + 2) / 8) * 8
    if (this.siteTarget.width !== columns || this.siteTarget.height !== rows) {
      this.siteTarget.setSize(columns, rows)
      ;(this.siteGridUniform.value as THREE.Vector2).set(columns, rows)
    }
    const fits =
      columns * SNAP_STEPS <= MAX_EDGE_TEXTURE && rows * SNAP_STEPS <= MAX_EDGE_TEXTURE
    this.edgeSnapUniform.value = fits ? this.edgeSnapRequested : 0
    const snapping = (this.edgeSnapUniform.value as number) > 0
    const edgeColumns = snapping ? columns * SNAP_STEPS : 1
    const edgeRows = snapping ? rows * SNAP_STEPS : 1
    if (this.edgeTarget.width !== edgeColumns || this.edgeTarget.height !== edgeRows)
      this.edgeTarget.setSize(edgeColumns, edgeRows)
  }

  override updateParams(params: LayerParameterValues): void {
    this.modeUniform.value = MODES[String(params.mode)] ?? 0
    const meshShader = (this.modeUniform.value as number) > 2.5
    if (meshShader !== this.meshShader) {
      this.meshShader = meshShader
      if (this.lut) this.rebuildEffectNode()
    }
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
    this.fillUniform.value = readNumber(params.meshFill, 1, 0, 1)
    this.wireUniform.value = readNumber(params.wire, 0.6, 0, 1)
    ;(this.wireColorUniform.value as THREE.Color).set(
      typeof params.wireColor === "string" ? params.wireColor : "#ffffff"
    )
    this.seedUniform.value = readNumber(params.seed, 0, 0, 999)
    this.edgeSnapRequested = readNumber(params.edgeSnap, 0, 0, 1)
    this.edgeSnapUniform.value = this.edgeSnapRequested
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
    this.syncSiteGrid()
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
    this.timeUniform.value = time * this.speed
    if ((this.edgeSnapUniform.value as number) > 0) {
      this.edgeInputNode.value = inputTexture
      renderer.setRenderTarget(this.edgeTarget)
      renderer.render(this.edgeScene, this.camera)
    }
    this.siteInputNode.value = inputTexture
    renderer.setRenderTarget(this.siteTarget)
    renderer.render(this.siteScene, this.camera)
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  private point(
    cell: Node,
    colorNode: Node,
    snap?: (position: Node) => Node
  ): Point {
    const spacing = this.spacingUniform
    const random = hash2(cell.add(this.seedUniform.mul(13.1))).toVar()
    const scatter = random.sub(0.5).mul(this.jitterUniform)
    const meshMode = this.modeUniform.greaterThan(2.5)
    const drift = vec2(0).toVar()
    If(this.driftUniform.greaterThan(0), () => {
      const phase = random.mul(6.2831853)
      const wobble = vec2(
        sin(this.timeUniform.add(phase.x)),
        cos(this.timeUniform.mul(0.8).add(phase.y))
      )
      drift.assign(
        select(
          meshMode,
          wobble.mul(vec2(0.5).sub(abs(scatter))).mul(this.driftUniform),
          wobble.mul(this.driftUniform.mul(0.35))
        )
      )
    })
    const local = scatter.add(0.5).add(drift)
    const jittered = cell.add(local).mul(spacing)
    const position = snap ? snap(jittered) : jittered
    const siteUv = position.div(this.documentSizeUniform)
    const sample = colorNode.sample(siteUv).level(0)
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
    return {
      position,
      uv: siteUv,
      tone: darkness,
      color: vec3(sample.r, sample.g, sample.b),
      present,
    }
  }

  private buildEdgeNode(): Node {
    return Fn(() => {
      const texel = floor(renderTargetUv().mul(this.siteGridUniform).mul(SNAP_STEPS))
      const cell = floor(texel.div(SNAP_STEPS))
      const candidate = texel.sub(cell.mul(SNAP_STEPS)).add(0.5).div(SNAP_STEPS)
      const center = cell.sub(SITE_MARGIN).add(candidate).mul(this.spacingUniform).toVar()
      const step = this.spacingUniform.div(SNAP_STEPS)
      const read = (offset: Node): Node => {
        const sample = this.edgeInputNode
          .sample(center.add(offset).div(this.documentSizeUniform))
          .level(0)
        const tone = perceptualLuma(sample)
        const darkness = select(this.invertUniform.greaterThan(0.5), tone, float(1).sub(tone))
        const alpha = clamp(sample.a, 0, 1)
        return vec2(darkness.mul(alpha), alpha).toVar()
      }
      const middle = read(vec2(0))
      const left = read(vec2(step.negate(), 0))
      const right = read(vec2(step, 0))
      const down = read(vec2(0, step.negate()))
      const up = read(vec2(0, step))
      const dx = right.sub(left)
      const dy = up.sub(down)
      const gradient = max(length(vec2(dx.x, dy.x)), length(vec2(dx.y, dy.y)))
      const ridge = middle.sub(left.add(right).add(down).add(up).mul(0.25))
      const inward = max(max(ridge.x, ridge.y), float(0))
      const edge = max(gradient.add(inward.mul(SNAP_RIDGE)).sub(SNAP_FLOOR), float(0))
      return vec4(edge, 0, 0, 1)
    })()
  }

  private snapToEdges(cell: Node, position: Node, edges: Node): Node {
    const spacing = this.spacingUniform
    const local = position.div(spacing).sub(cell).toVar()
    const origin = cell.add(SITE_MARGIN).mul(SNAP_STEPS).toVar()
    const weighted = vec2(0).toVar()
    const weightSum = float(0).toVar()
    const edgeSum = float(0).toVar()
    const peak = float(0).toVar()
    for (let j = 0; j < SNAP_STEPS; j++) {
      for (let i = 0; i < SNAP_STEPS; i++) {
        const edge = edges.load(origin.add(vec2(i, j))).x.toVar()
        const candidate = vec2((i + 0.5) / SNAP_STEPS, (j + 0.5) / SNAP_STEPS)
        const away = candidate.sub(local)
        const square = edge.mul(edge)
        const weight = square.mul(square).mul(exp(dot(away, away).mul(-SNAP_REACH)))
        weighted.addAssign(candidate.mul(weight))
        weightSum.addAssign(weight)
        edgeSum.addAssign(edge)
        peak.assign(max(peak, edge))
      }
    }
    const target = cell.add(weighted.div(max(weightSum, float(1e-10)))).mul(spacing)
    const contrast = peak.sub(edgeSum.div(SNAP_STEPS * SNAP_STEPS))
    const pull = this.edgeSnapUniform.mul(smoothstep(0, SNAP_RAMP, contrast))
    return mix(position, target, pull)
  }

  private buildSiteNode(): Node {
    const edges = tslTexture(this.edgeTarget.texture)
    return Fn(() => {
      const cell = floor(renderTargetUv().mul(this.siteGridUniform)).sub(SITE_MARGIN)
      const mesh = this.modeUniform.greaterThan(2.5)
      const packed = vec4(0).toVar()
      If(this.edgeSnapUniform.greaterThan(0), () => {
        const site = this.point(cell, this.siteInputNode, (position) =>
          this.snapToEdges(cell, position, edges)
        )
        packed.assign(vec4(select(mesh, site.position, site.uv), site.tone, site.present))
      }).Else(() => {
        If(mesh, () => {
          const site = this.point(cell, this.siteInputNode)
          packed.assign(vec4(site.position, site.tone, site.present))
        }).Else(() => {
          const site = this.point(cell, this.siteInputNode)
          packed.assign(vec4(site.uv, site.tone, site.present))
        })
      })
      return packed
    })()
  }

  private dotDistance(offsetValue: Node, radiusValue: Node): Node {
    const offset = offsetValue.toVar()
    const radius = radiusValue.toVar()
    const shape = this.shapeUniform
    const result = float(0).toVar()
    If(shape.lessThan(0.5), () => {
      result.assign(length(offset).sub(radius))
    }).Else(() => {
      If(shape.lessThan(1.5), () => {
        result.assign(max(abs(offset.x), abs(offset.y)).sub(radius))
      }).Else(() => {
        If(shape.lessThan(2.5), () => {
          const arm = radius.mul(0.32)
          result.assign(
            min(
              max(abs(offset.x).sub(radius), abs(offset.y).sub(arm)),
              max(abs(offset.y).sub(radius), abs(offset.x).sub(arm))
            )
          )
        }).Else(() => {
          result.assign(abs(length(offset).sub(radius.mul(0.72))).sub(radius.mul(0.28)))
        })
      })
    })
    return result
  }

  protected override buildEffectNode(): Node {
    if (!this.lut) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode
    const lutNode = tslTexture(this.lut, vec2(0.5, 0.5))
    const sitesNode = tslTexture(this.siteTarget.texture)
    const site = (cell: Node): Site => {
      const packed = sitesNode.load(cell.add(SITE_MARGIN)).toVar()
      return { uv: packed.xy, tone: packed.z, present: packed.w }
    }

    return Fn(() => {
      const targetUv = renderTargetUv()
      const pixel = targetUv.mul(this.documentSizeUniform).toVar()
      const base = floor(pixel.div(this.spacingUniform)).toVar()
      const mode = this.modeUniform
      const blobs = mode.greaterThan(0.5).and(mode.lessThan(1.5)).toVar()
      const plexus = mode.greaterThan(1.5).toVar()
      const source = this.colorModeUniform
        .greaterThanEqual(0.5)
        .and(this.colorModeUniform.lessThan(1.5))
        .toVar()
      const spacing = this.spacingUniform
      const smooth = select(blobs, this.blobinessUniform.mul(spacing).mul(0.6).add(0.001), float(0.001)).toVar()
      const sharpness = select(blobs, smooth, float(0.6)).toVar()
      const siteColor = (siteUv: Node): Node => {
        const sample = colorNode.sample(siteUv).level(0)
        return vec3(sample.r, sample.g, sample.b)
      }

      const field = float(1e5).toVar()
      const weightSum = float(0).toVar()
      const toneSum = float(0).toVar()
      const colorSum = vec3(0).toVar()
      const lineCoverage = float(0).toVar()
      const lineTone = float(0).toVar()
      const lineColor = vec3(0).toVar()

      const mergeField = (d: Node) => {
        If(blobs, () => {
          const h = clamp(float(0.5).add(float(0.5).mul(d.sub(field)).div(smooth)), 0, 1)
          field.assign(mix(d, field, h).sub(smooth.mul(h).mul(float(1).sub(h))))
        }).Else(() => {
          field.assign(min(field, d))
        })
      }
      const addShape = (distance: () => Node, tone: () => Node, color: () => Node, present: Node) => {
        If(present.greaterThan(0.5), () => {
          const d = distance().toVar()
          mergeField(d)
          const weight = exp(max(d, float(0)).negate().div(sharpness)).toVar()
          weightSum.addAssign(weight)
          toneSum.addAssign(tone().mul(weight))
          If(source, () => {
            colorSum.addAssign(color().mul(weight))
          })
        }).Else(() => {
          If(blobs, () => {
            mergeField(float(1e5))
          })
        })
      }

      const meshCoverage = float(0).toVar()
      const meshColor = vec3(0).toVar()
      const meshEdge = float(1e5).toVar()
      const meshTone = float(0).toVar()
      const meshSite = (cell: Node): Point => {
        const packed = sitesNode.load(cell.add(SITE_MARGIN)).toVar()
        const siteUv = packed.xy.div(this.documentSizeUniform)
        return {
          position: packed.xy,
          uv: siteUv,
          tone: packed.z,
          color: siteColor(siteUv),
          present: packed.w,
        }
      }
      if (this.meshShader) {
        Loop({ start: 0, end: 9, type: "int", name: "quadIndex" }, (quadInputs) => {
          const index = float((quadInputs as unknown as { quadIndex: Node }).quadIndex)
          const cell = base.add(vec2(index.mod(3).sub(1), floor(index.div(3)).sub(1)))
          const p00 = meshSite(cell)
          const p10 = meshSite(cell.add(vec2(1, 0)))
          const p01 = meshSite(cell.add(vec2(0, 1)))
          const p11 = meshSite(cell.add(vec2(1, 1)))
          const diagonalSide = (p: Point, q: Point, r: Point) =>
            q.position.x
              .sub(p.position.x)
              .mul(r.position.y.sub(p.position.y))
              .sub(q.position.y.sub(p.position.y).mul(r.position.x.sub(p.position.x)))
          const splitMain = diagonalSide(p00, p11, p10).mul(diagonalSide(p00, p11, p01)).lessThanEqual(0)
          const pickPoint = (when: Node, yes: Point, no: Point): Point => ({
            position: select(when, yes.position, no.position),
            tone: select(when, yes.tone, no.tone),
            color: select(when, yes.color, no.color),
            present: select(when, yes.present, no.present),
            uv: select(when, yes.uv, no.uv),
          })
          for (const [a, b, c] of [
            [p00, p10, pickPoint(splitMain, p11, p01)],
            [pickPoint(splitMain, p00, p10), p11, p01],
          ] as const) {
            const cross = (u: Node, v: Node, w: Node) =>
              v.x.sub(u.x).mul(w.y.sub(u.y)).sub(v.y.sub(u.y).mul(w.x.sub(u.x)))
            const d1 = cross(a.position, b.position, pixel)
            const d2 = cross(b.position, c.position, pixel)
            const d3 = cross(c.position, a.position, pixel)
            const inside = d1
              .greaterThanEqual(0)
              .and(d2.greaterThanEqual(0))
              .and(d3.greaterThanEqual(0))
              .or(d1.lessThanEqual(0).and(d2.lessThanEqual(0)).and(d3.lessThanEqual(0)))
            const segment = (u: Node, v: Node) => {
              const edge = v.sub(u)
              const t = clamp(dot(pixel.sub(u), edge).div(max(dot(edge, edge), float(0.0001))), 0, 1)
              return length(pixel.sub(u).sub(edge.mul(t)))
            }
            const edgeDistance = min(
              min(segment(a.position, b.position), segment(b.position, c.position)),
              segment(c.position, a.position)
            )
            const tone = a.tone.add(b.tone).add(c.tone).div(3)
            const color = a.color.add(b.color).add(c.color).div(3)
            const present = a.present.mul(b.present).mul(c.present)
            If(inside, () => {
              meshCoverage.assign(present)
              meshColor.assign(color)
              meshTone.assign(tone)
              meshEdge.assign(select(present.greaterThan(0.5), edgeDistance, float(1e5)))
            })
          }
        })
      } else {
        Loop({ start: 0, end: 9, type: "int", name: "centerIndex" }, (centerInputs) => {
          const centerIndex = (centerInputs as unknown as { centerIndex: Node }).centerIndex
          const offset = vec2(float(centerIndex.mod(3)).sub(1), float(centerIndex.div(3)).sub(1))
          const cellA = base.add(offset).toVar()
          const a = site(cellA)
          const aPosition = a.uv.mul(this.documentSizeUniform).toVar()
          const aTone = a.tone
          const aPresent = a.present
          const aColor = vec3(0).toVar()
          If(source, () => {
            aColor.assign(siteColor(a.uv))
          })
          const radius = mix(this.minSizeUniform, this.maxSizeUniform, aTone).mul(spacing).mul(0.5)
          const size = select(plexus, radius.mul(0.5), radius)
          addShape(() => this.dotDistance(pixel.sub(aPosition), size), () => aTone, () => aColor, aPresent)
          for (const [dx, dy] of LINK_DIRECTIONS) {
            const direction = vec2(dx, dy)
            const b = site(cellA.add(direction))
            const bPosition = b.uv.mul(this.documentSizeUniform)
            const bTone = b.tone
            const both = aPresent.mul(b.present).toVar()
            const segment = bPosition.sub(aPosition).toVar()
            const along = () =>
              clamp(
                dot(pixel.sub(aPosition), segment).div(max(dot(segment, segment), float(0.0001))),
                0,
                1
              ).toVar()
            const distanceAlong = (t: Node) => length(pixel.sub(aPosition).sub(segment.mul(t)))
            const color = (t: Node) => mix(aColor, siteColor(b.uv), t)
            If(plexus, () => {
              const span = length(segment)
              const reach = this.rangeUniform.mul(spacing)
              const fade = clamp(float(1).sub(span.div(reach)), 0, 1).mul(both).toVar()
              If(fade.greaterThan(0), () => {
                const t = along()
                const distance = distanceAlong(t)
                const line = float(1)
                  .sub(smoothstep(this.lineWidthUniform.mul(0.5).sub(0.6), this.lineWidthUniform.mul(0.5).add(0.6), distance))
                  .mul(fade)
                  .toVar()
                const stronger = line.greaterThan(lineCoverage).toVar()
                lineTone.assign(select(stronger, mix(aTone, bTone, t), lineTone))
                If(source, () => {
                  lineColor.assign(select(stronger, color(t), lineColor))
                })
                lineCoverage.assign(max(lineCoverage, line))
              })
            }).Else(() => {
              const pairCell = cellA.add(vec2(Math.min(0, dx), Math.min(0, dy)))
              const pairKey = pairCell.mul(2).add(vec2(Math.abs(dx) + (dx * dy < 0 ? 5 : 0), Math.abs(dy)))
              const roll = hash2(pairKey.add(this.seedUniform.mul(7.7))).x
              const darkness = aTone.add(bTone).mul(0.5).toVar()
              const chance = smoothstep(
                this.linkThresholdUniform.sub(0.15),
                this.linkThresholdUniform.add(0.15),
                darkness
              ).mul(this.linksUniform)
              const linked = select(roll.lessThan(chance), float(1), float(0)).mul(both).toVar()
              const t = float(0).toVar()
              addShape(
                () => {
                  t.assign(along())
                  const width = mix(this.linkMinUniform, this.linkMaxUniform, pow(darkness, float(1.5)))
                    .mul(spacing)
                    .mul(0.5)
                  return distanceAlong(t).sub(width)
                },
                () => mix(aTone, bTone, t),
                () => color(t),
                linked
              )
            })
          }
        })
      }

      const backgroundMode = this.backgroundModeUniform
      const backgroundRgb = vec3(this.backgroundUniform).toVar()
      const backgroundAlpha = float(1).toVar()
      If(backgroundMode.greaterThanEqual(0.5), () => {
        const input = colorNode.sample(targetUv).level(0)
        backgroundRgb.assign(vec3(input.r, input.g, input.b))
        backgroundAlpha.assign(select(backgroundMode.lessThan(1.5), float(input.a), float(0)))
      })
      const pick = (toneValue: Node, sourceValue: Node): Node => {
        const palette = lutNode.sample(vec2(float(1).sub(toneValue), float(0.5))).level(0)
        const colorMode = this.colorModeUniform
        return select(
          colorMode.lessThan(0.5),
          vec3(palette.r, palette.g, palette.b),
          select(colorMode.lessThan(1.5), sourceValue, vec3(this.inkUniform))
        )
      }
      const finalRgb = vec3(0).toVar()
      const finalAlpha = float(0).toVar()
      if (this.meshShader) {
        const facet = pick(meshTone, meshColor)
        const wire = float(1)
          .sub(smoothstep(this.lineWidthUniform.mul(0.5).sub(0.6), this.lineWidthUniform.mul(0.5).add(0.6), meshEdge))
          .mul(this.wireUniform)
        const fillAmount = meshCoverage.mul(this.fillUniform)
        const meshFilled = mix(backgroundRgb.mul(backgroundAlpha), facet, fillAmount)
        const meshFillAlpha = mix(backgroundAlpha, float(1), fillAmount)
        finalRgb.assign(mix(meshFilled, vec3(this.wireColorUniform), wire))
        finalAlpha.assign(mix(meshFillAlpha, float(1), wire))
      } else {
        const coverage = float(1).sub(smoothstep(-0.7, 0.7, field))
        const tone = toneSum.div(max(weightSum, float(0.0001)))
        const sourceColor = colorSum.div(max(weightSum, float(0.0001)))
        const dotColor = pick(tone, sourceColor)
        const withLines = backgroundRgb.mul(backgroundAlpha).toVar()
        If(plexus, () => {
          withLines.assign(mix(withLines, pick(lineTone, lineColor), lineCoverage))
        })
        const linesAlpha = mix(backgroundAlpha, float(1), lineCoverage)
        finalRgb.assign(mix(withLines, dotColor, coverage))
        finalAlpha.assign(mix(linesAlpha, float(1), coverage))
      }
      return vec4(finalRgb.div(max(finalAlpha, float(0.0001))), finalAlpha)
    })()
  }

  override dispose(): void {
    this.siteTarget.dispose()
    this.edgeTarget.dispose()
    this.edgeMaterial.dispose()
    this.siteMaterial.dispose()
    this.siteGeometry.dispose()
    this.lut.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
