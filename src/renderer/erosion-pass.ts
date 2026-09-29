import {
  abs,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  min,
  mix,
  pow,
  select,
  smoothstep,
  step,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const MODE_EDGES = 0
const MODE_LIGHT = 1
const MODE_DARK = 2
const MODE_ALPHA = 3

function toMode(value: unknown): number {
  switch (value) {
    case "light":
      return MODE_LIGHT
    case "dark":
      return MODE_DARK
    case "alpha":
      return MODE_ALPHA
    default:
      return MODE_EDGES
  }
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

export class ErosionPass extends PassNode {
  private readonly modeUniform: Node
  private readonly erodeUniform: Node
  private readonly edgeWidthUniform: Node
  private readonly speckleUniform: Node
  private readonly clumpingUniform: Node
  private readonly scatterUniform: Node
  private readonly transparentUniform: Node
  private readonly paperColorUniform: Node
  private readonly seedUniform: Node
  private readonly timeUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly placeholder = new THREE.Texture()
  private readonly source: Node
  private speed = 0

  constructor(layerId: string) {
    super(layerId)
    this.modeUniform = uniform(MODE_EDGES)
    this.erodeUniform = uniform(0)
    this.edgeWidthUniform = uniform(6)
    this.speckleUniform = uniform(3)
    this.clumpingUniform = uniform(0.4)
    this.scatterUniform = uniform(0)
    this.transparentUniform = uniform(0)
    this.paperColorUniform = uniform(new THREE.Color("#f2efe8"))
    this.seedUniform = uniform(0)
    this.timeUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.source = tslTexture(this.placeholder)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.source.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.modeUniform.value = toMode(params.mode)
    this.erodeUniform.value = readNumber(params.erode, 0, 0, 1)
    this.edgeWidthUniform.value = readNumber(params.edgeWidth, 6, 0.5, 64)
    this.speckleUniform.value = readNumber(params.speckleSize, 3, 1, 32)
    this.clumpingUniform.value = readNumber(params.clumping, 0.4, 0, 1)
    this.scatterUniform.value = readNumber(params.scatter, 0, 0, 1)
    this.transparentUniform.value = params.output === "transparent" ? 1 : 0
    ;(this.paperColorUniform.value as THREE.Color).set(
      typeof params.paperColor === "string" ? params.paperColor : "#f2efe8"
    )
    this.seedUniform.value = readNumber(params.seed, 0, 0, 9999)
    this.speed = readNumber(params.speed, 0, 0, 4)
  }

  override needsContinuousRender(): boolean {
    return this.speed > 0.0001
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = this.speed > 0 ? time * this.speed : 0
  }

  private field(point: Node, texel: Node, center: Node): Node {
    const reach = texel.mul(this.edgeWidthUniform)
    const right = this.source.sample(point.add(vec2(reach.x, 0))).level(0).toVar()
    const left = this.source.sample(point.sub(vec2(reach.x, 0))).level(0).toVar()
    const down = this.source.sample(point.add(vec2(0, reach.y))).level(0).toVar()
    const up = this.source.sample(point.sub(vec2(0, reach.y))).level(0).toVar()
    const mode = this.modeUniform
    const value = float(0).toVar()
    If(mode.lessThan(0.5), () => {
      const lr = perceptualLuma(right)
      const ll = perceptualLuma(left)
      const ld = perceptualLuma(down)
      const lu = perceptualLuma(up)
      const gradient = abs(lr.sub(ll)).add(abs(ld.sub(lu)))
      value.assign(smoothstep(0.1, 0.5, gradient))
    }).Else(() => {
      If(mode.lessThan(2.5), () => {
        const lc = perceptualLuma(center)
        const lr = perceptualLuma(right)
        const ll = perceptualLuma(left)
        const ld = perceptualLuma(down)
        const lu = perceptualLuma(up)
        const tone = lc.mul(2).add(lr).add(ll).add(ld).add(lu).div(6)
        const light = smoothstep(0.35, 0.95, tone)
        const dark = float(1).sub(smoothstep(0.05, 0.65, tone))
        value.assign(select(mode.lessThan(1.5), light, dark))
      }).Else(() => {
        const alpha = float(center.a)
          .mul(2)
          .add(right.a)
          .add(left.a)
          .add(down.a)
          .add(up.a)
          .div(6)
        value.assign(float(1).sub(smoothstep(0.02, 0.98, alpha)))
      })
    })
    return value
  }

  protected override buildEffectNode(): Node {
    if (!this.logicalHeightUniform) {
      return this.inputNode
    }

    return Fn(() => {
      const targetUv = vec2(uv().x, float(1).sub(uv().y)).toVar()
      const original = this.source.sample(targetUv).level(0).toVar()
      const result = vec4(
        vec3(original.r, original.g, original.b),
        float(original.a)
      ).toVar()
      If(this.erodeUniform.greaterThanEqual(0.0001), () => {
        const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
        const texel = vec2(float(1).div(size.x), float(1).div(size.y)).toVar()
        const pixel = targetUv.mul(size).toVar()
        const shortSide = min(size.x, size.y)
        const seed = this.seedUniform.mul(13.7).toVar()
        const tick = floor(this.timeUniform.mul(8)).toVar()
        const active = step(float(0.0001), this.erodeUniform)

        const cell = floor(pixel.div(this.speckleUniform))
        const key = cell.add(vec2(seed, tick.mul(1.37))).toVar()
        const boundary = this.field(targetUv, texel, original)
        const throwDistance = this.scatterUniform
          .mul(shortSide)
          .mul(0.06)
          .mul(boundary)
          .mul(hash(key.add(7.7)))
          .toVar()
        const kept = original.toVar()
        const keptValue = boundary.toVar()
        If(abs(throwDistance).greaterThan(0), () => {
          const direction = vec2(hash(key.add(1.3)), hash(key.add(2.9)))
            .sub(0.5)
            .mul(2)
          const thrown = targetUv
            .add(direction.mul(throwDistance).mul(texel))
            .toVar()
          const thrownColor = this.source.sample(thrown).level(0).toVar()
          keptValue.assign(this.field(thrown, texel, thrownColor))
          kept.assign(thrownColor)
        })

        const grain = hash(key)
        const clumps = valueNoise(
          pixel.div(this.speckleUniform.mul(7)).add(vec2(seed, tick))
        )
        const noise = mix(grain, clumps, this.clumpingUniform)
        const chance = clamp(
          keptValue
            .mul(this.erodeUniform.mul(2.5))
            .sub(float(1).sub(this.erodeUniform).mul(0.25)),
          0,
          1
        )
        const fragment = float(1).sub(
          step(this.scatterUniform.mul(0.55).mul(boundary), hash(key.add(5.3)))
        )
        const removed = float(1)
          .sub(step(chance, noise))
          .mul(float(1).sub(fragment))
          .mul(active)

        const keptAlpha = clamp(float(kept.a), 0, 1)
        const keptRgb = vec3(kept.r, kept.g, kept.b)
        const transparent = this.transparentUniform.greaterThan(0.5)
        const rgb = select(
          transparent,
          keptRgb,
          mix(keptRgb, this.paperColorUniform, removed)
        )
        const alpha = select(
          transparent,
          keptAlpha.mul(float(1).sub(removed)),
          keptAlpha
        )
        result.assign(
          vec4(
            mix(vec3(original.r, original.g, original.b), rgb, active),
            mix(float(original.a), alpha, active)
          )
        )
      })
      return result
    })()
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
