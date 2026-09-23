import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { BlurPyramid } from "./blur-pyramid"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const PATTERNS: Record<string, number> = {
  frosted: 4,
  hammered: 1,
  hex: 3,
  pyramid: 2,
  reeded: 0,
}

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

function hash2(p: Node): Node {
  const q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))
  return fract(sin(q).mul(43758.5453))
}

function hash(p: Node): Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031))
  const shifted = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(shifted.x.add(shifted.y).mul(shifted.z))
}

function valueNoise(p: Node): Node {
  const cell = floor(p)
  const local = fract(p)
  const eased = local.mul(local).mul(float(3).sub(local.mul(2)))
  const a = hash(cell)
  const b = hash(cell.add(vec2(1, 0)))
  const c = hash(cell.add(vec2(0, 1)))
  const d = hash(cell.add(vec2(1, 1)))
  return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y)
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

type Cell = { lens: Node; slope: Node; seam: Node }

export class GlassPass extends PassNode {
  private readonly patternUniform: Node
  private readonly sharpUniform: Node
  private readonly cellSizeUniform: Node
  private readonly angleUniform: Node
  private readonly irregularityUniform: Node
  private readonly refractionUniform: Node
  private readonly distanceUniform: Node
  private readonly fromDepthUniform: Node
  private readonly frostUniform: Node
  private readonly frostSizeUniform: Node
  private readonly highlightsUniform: Node
  private readonly lightAngleUniform: Node
  private readonly edgesUniform: Node
  private readonly dispersionUniform: Node
  private readonly tintUniform: Node
  private readonly tintAmountUniform: Node
  private readonly hasDepthUniform: Node
  private readonly outputPerDocumentUniform: Node
  private readonly documentSizeUniform: Node
  private readonly pyramid = new BlurPyramid()
  private readonly placeholder = new THREE.Texture()
  private readonly depthPlaceholder = new THREE.Texture()
  private colorNode: Node | null = null
  private depthNode: Node | null = null
  private outputWidth = 1
  private logicalWidth = 1

  constructor(layerId: string) {
    super(layerId)
    this.patternUniform = uniform(0)
    this.sharpUniform = uniform(0)
    this.cellSizeUniform = uniform(22)
    this.angleUniform = uniform(0)
    this.irregularityUniform = uniform(0.7)
    this.refractionUniform = uniform(1)
    this.distanceUniform = uniform(10)
    this.fromDepthUniform = uniform(0)
    this.frostUniform = uniform(0)
    this.frostSizeUniform = uniform(1.5)
    this.highlightsUniform = uniform(0.8)
    this.lightAngleUniform = uniform((135 * Math.PI) / 180)
    this.edgesUniform = uniform(0.3)
    this.dispersionUniform = uniform(0)
    this.tintUniform = uniform(new THREE.Color("#ffffff"))
    this.tintAmountUniform = uniform(0)
    this.hasDepthUniform = uniform(0)
    this.outputPerDocumentUniform = uniform(1)
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.rebuildEffectNode()
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.pyramid.resize(width, height)
    this.outputPerDocumentUniform.value = this.outputWidth / this.logicalWidth
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    ;(this.documentSizeUniform.value as THREE.Vector2).set(
      this.logicalWidth,
      Math.max(1, height)
    )
    this.outputPerDocumentUniform.value = this.outputWidth / this.logicalWidth
  }

  override updateParams(params: LayerParameterValues): void {
    this.patternUniform.value = PATTERNS[String(params.pattern)] ?? 0
    this.sharpUniform.value = params.profile === "sharp" ? 1 : 0
    this.cellSizeUniform.value = readNumber(params.cellSize, 22, 3, 240)
    this.angleUniform.value =
      (readNumber(params.angle, 0, -180, 180) * Math.PI) / 180
    this.irregularityUniform.value = readNumber(params.irregularity, 0.7, 0, 1)
    this.refractionUniform.value = readNumber(params.refraction, 1, 0, 3)
    this.distanceUniform.value = readNumber(params.distance, 10, 0, 240)
    this.fromDepthUniform.value = params.distanceFrom === "depth" ? 1 : 0
    this.frostUniform.value = readNumber(params.frost, 0, 0, 1)
    this.frostSizeUniform.value = readNumber(params.frostSize, 1.5, 0.5, 8)
    this.highlightsUniform.value = readNumber(params.highlights, 0.8, 0, 3)
    this.lightAngleUniform.value =
      (readNumber(params.lightAngle, 135, 0, 360) * Math.PI) / 180
    this.edgesUniform.value = readNumber(params.edges, 0.3, 0, 1)
    this.dispersionUniform.value = readNumber(params.dispersion, 0, 0, 1)
    ;(this.tintUniform.value as THREE.Color).set(
      typeof params.tint === "string" ? params.tint : "#ffffff"
    )
    this.tintAmountUniform.value = readNumber(params.tintAmount, 0, 0, 1)
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.pyramid.render(renderer, inputTexture)
    if (this.colorNode) this.colorNode.value = inputTexture
    const depth = this.sceneDepthTexture
    this.hasDepthUniform.value = depth ? 1 : 0
    if (this.depthNode) this.depthNode.value = depth ?? this.depthPlaceholder
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  private reeded(q: Node): Cell {
    const s = q.x.div(this.cellSizeUniform)
    const x = fract(s).sub(0.5)
    const round = x.div(sqrt(max(float(0.25).sub(x.mul(x)), float(0.012)))).mul(0.5)
    const sharp = select(x.lessThan(0), float(-1), float(1)).mul(0.9)
    const bend = select(this.sharpUniform.greaterThan(0.5), sharp, round)
    const lens = vec2(select(this.sharpUniform.greaterThan(0.5), sharp.mul(0.5), x.mul(2)), 0)
    return {
      lens,
      slope: vec2(bend, 0),
      seam: float(0.5).sub(abs(x)),
    }
  }

  private hammered(q: Node): Cell {
    const p = q.div(this.cellSizeUniform)
    const base = floor(p)
    const local = fract(p)
    let nearest: Node = float(8)
    let second: Node = float(8)
    let offset: Node = vec2(0)
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const neighbor = vec2(x, y)
        const jitter = hash2(base.add(neighbor))
          .sub(0.5)
          .mul(this.irregularityUniform)
          .add(0.5)
        const delta = neighbor.add(jitter).sub(local)
        const distance = dot(delta, delta)
        const closer = distance.lessThan(nearest)
        second = select(closer, nearest, min(second, distance))
        offset = select(closer, delta, offset)
        nearest = select(closer, distance, nearest)
      }
    }
    const v = offset.negate()
    const edge = sqrt(second).sub(sqrt(nearest)).mul(0.5)
    return { lens: v.mul(2), slope: v.mul(1.6), seam: edge }
  }

  private pyramidCell(q: Node): Cell {
    const p = q.div(this.cellSizeUniform)
    const v = fract(p).sub(0.5)
    const horizontal = abs(v.x).greaterThan(abs(v.y))
    const facet = select(
      horizontal,
      vec2(select(v.x.lessThan(0), float(-1), float(1)), 0),
      vec2(0, select(v.y.lessThan(0), float(-1), float(1)))
    )
    return {
      lens: v.mul(2),
      slope: facet.mul(0.8),
      seam: float(0.5).sub(max(abs(v.x), abs(v.y))),
    }
  }

  private hexCell(q: Node): Cell {
    const p = q.div(this.cellSizeUniform)
    const r = vec2(1, 1.7320508)
    const h = r.mul(0.5)
    const a = p.sub(floor(p.div(r)).add(0.5).mul(r))
    const b = p.sub(floor(p.sub(h).div(r)).add(0.5).mul(r)).sub(h)
    const v = select(dot(a, a).lessThan(dot(b, b)), a, b)
    const av = abs(v)
    const hexDistance = max(dot(av, vec2(0.5, 0.8660254)), av.x)
    const dome = v.div(sqrt(max(float(0.3).sub(dot(v, v)), float(0.03))))
    return { lens: v.mul(2), slope: dome.mul(0.5), seam: float(0.5).sub(hexDistance) }
  }

  protected override buildEffectNode(): Node {
    if (!this.tintAmountUniform) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode
    const depthNode = tslTexture(this.depthPlaceholder, renderTargetUv())
    this.depthNode = depthNode

    return Fn(() => {
      const targetUv = renderTargetUv()
      const pixel = targetUv.mul(this.documentSizeUniform)
      const c = cos(this.angleUniform)
      const s = sin(this.angleUniform)
      const q = vec2(pixel.x.mul(c).add(pixel.y.mul(s)), pixel.y.mul(c).sub(pixel.x.mul(s)))

      const reeded = this.reeded(q)
      const hammered = this.hammered(q)
      const pyramid = this.pyramidCell(q)
      const hex = this.hexCell(q)
      const pattern = this.patternUniform
      const choose = (key: keyof Cell): Node =>
        select(
          pattern.lessThan(0.5),
          reeded[key],
          select(
            pattern.lessThan(1.5),
            hammered[key],
            select(
              pattern.lessThan(2.5),
              pyramid[key],
              select(pattern.lessThan(3.5), hex[key], key === "seam" ? float(1) : vec2(0))
            )
          )
        )
      const lens = choose("lens")
      const slope = choose("slope")
      const seam = choose("seam")

      const frostPoint = pixel.div(this.frostSizeUniform)
      const frostSlope = vec2(
        valueNoise(frostPoint.add(vec2(0.5, 0))).sub(valueNoise(frostPoint.sub(vec2(0.5, 0)))),
        valueNoise(frostPoint.add(vec2(0, 0.5))).sub(valueNoise(frostPoint.sub(vec2(0, 0.5))))
      ).mul(this.frostUniform).mul(1.2)

      const shiftLocal = lens
        .mul(this.refractionUniform)
        .mul(this.cellSizeUniform)
        .mul(-1)
        .add(frostSlope.mul(this.frostSizeUniform).mul(this.frostUniform).mul(2))
      const shift = vec2(
        shiftLocal.x.mul(c).sub(shiftLocal.y.mul(s)),
        shiftLocal.x.mul(s).add(shiftLocal.y.mul(c))
      ).div(this.documentSizeUniform)
      const seen = targetUv.add(shift)

      const depth = float(depthNode.sample(seen).level(0).r)
      const behind = select(
        this.fromDepthUniform.greaterThan(0.5).and(this.hasDepthUniform.greaterThan(0.5)),
        float(1).sub(depth),
        float(1)
      )
      const blurDocument = this.distanceUniform.mul(behind).add(this.frostUniform.mul(6))
      const level = this.pyramid.levelFor(blurDocument.mul(this.outputPerDocumentUniform))
      const spread = shift.mul(this.dispersionUniform).mul(0.35)
      const green = this.pyramid.sample(colorNode, seen, level, true)
      const red = this.pyramid.sample(colorNode, seen.add(spread), level, true)
      const blue = this.pyramid.sample(colorNode, seen.sub(spread), level, true)
      const alpha = max(green.a, float(0.0001))
      let rgb: Node = vec3(
        red.r.div(max(red.a, float(0.0001))),
        green.g.div(alpha),
        blue.b.div(max(blue.a, float(0.0001)))
      )

      const surface = slope.add(frostSlope)
      const worldSlope = vec2(
        surface.x.mul(c).sub(surface.y.mul(s)),
        surface.x.mul(s).add(surface.y.mul(c))
      )
      const normal = vec3(worldSlope.x.negate(), worldSlope.y, float(1)).normalize()
      const lightFlat = vec2(cos(this.lightAngleUniform), sin(this.lightAngleUniform).negate())
      const steep = smoothstep(0.55, 1.6, worldSlope.length())
      const side = clamp(
        dot(worldSlope.div(max(worldSlope.length(), float(0.0001))), lightFlat).negate().mul(0.5).add(0.5),
        0,
        1
      )
      const rim = steep.mul(this.highlightsUniform)
      const light = vec3(lightFlat.x.mul(0.6), lightFlat.y.negate().mul(0.6), 0.8).normalize()
      const halfway = light.add(vec3(0, 0, 1)).normalize()
      const glint = pow(max(dot(normal, halfway), float(0)), float(60))
        .mul(this.highlightsUniform)
        .mul(0.12)
      const facing = dot(normal, light)
        .div(light.z)
        .sub(1)
        .mul(0.06)
        .mul(this.highlightsUniform.add(this.frostUniform.mul(1.5)))
      const groove = float(1)
        .sub(smoothstep(float(0), float(1.4), seam.mul(this.cellSizeUniform)))
        .mul(this.edgesUniform)
      rgb = rgb.mul(float(1).add(facing)).mul(float(1).sub(groove.mul(0.7)))
      rgb = rgb.mul(float(1).sub(rim.mul(float(1).sub(side)).mul(0.2)))
      rgb = rgb.add(vec3(rim.mul(side).mul(0.45).add(glint)))
      const crinkle = valueNoise(frostPoint.mul(1.7).add(11.3)).sub(0.5)
      rgb = rgb.mul(float(1).add(crinkle.mul(this.frostUniform).mul(0.14)))
      rgb = mix(rgb, rgb.mul(vec3(this.tintUniform)), this.tintAmountUniform)
      return vec4(clamp(rgb, 0, 1), clamp(green.a, 0, 1))
    })()
  }

  override dispose(): void {
    this.pyramid.dispose()
    this.placeholder.dispose()
    this.depthPlaceholder.dispose()
    super.dispose()
  }
}
