import {
  abs,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  length,
  max,
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
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const FAR = 1e5
const MAX_REACH = 512
const SOURCES: Record<string, number> = { alpha: 0, dark: 1, light: 2 }
const STYLES: Record<string, number> = { dashed: 2, double: 1, scalloped: 3, solid: 0 }

const SEED_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.FloatType,
} as const

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
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

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

type Stage = {
  input: Node
  material: THREE.MeshBasicNodeMaterial
  scene: THREE.Scene
}

/**
 * Outlines shapes with a jump-flood distance field. The seed texture keeps the
 * nearest boundary pixel in xy and the nearest sparse boundary pixel (one every
 * Spacing along the contour) in zw; the sparse field draws scallops and dashes.
 */
export class OutlinePass extends PassNode {
  private readonly sourceUniform: Node
  private readonly thresholdUniform: Node
  private readonly styleUniform: Node
  private readonly offsetUniform: Node
  private readonly widthUniform: Node
  private readonly ringsUniform: Node
  private readonly ringGapUniform: Node
  private readonly spacingUniform: Node
  private readonly lineColorUniform: Node
  private readonly fillUniform: Node
  private readonly fillColorUniform: Node
  private readonly showImageUniform: Node
  private readonly scaleUniform: Node
  private readonly texelUniform: Node
  private readonly stepUniform: Node
  private readonly placeholder = new THREE.Texture()
  private readonly camera2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly ping = new THREE.WebGLRenderTarget(1, 1, SEED_OPTIONS)
  private readonly pong = new THREE.WebGLRenderTarget(1, 1, SEED_OPTIONS)
  private readonly seedStage: Stage
  private readonly floodStage: Stage
  private fieldNode: Node | null = null
  private colorNode: Node | null = null
  private outputWidth = 1
  private outputHeight = 1
  private logicalWidth = 1
  private reach = 64

  constructor(layerId: string) {
    super(layerId)
    this.sourceUniform = uniform(0)
    this.thresholdUniform = uniform(0.5)
    this.styleUniform = uniform(0)
    this.offsetUniform = uniform(6)
    this.widthUniform = uniform(2)
    this.ringsUniform = uniform(1)
    this.ringGapUniform = uniform(8)
    this.spacingUniform = uniform(18)
    this.lineColorUniform = uniform(new THREE.Color("#111111"))
    this.fillUniform = uniform(0)
    this.fillColorUniform = uniform(new THREE.Color("#ffffff"))
    this.showImageUniform = uniform(1)
    this.scaleUniform = uniform(1)
    this.texelUniform = uniform(new THREE.Vector2(1, 1))
    this.stepUniform = uniform(1)
    this.seedStage = this.createStage()
    this.seedStage.material.colorNode = this.buildSeedNode(this.seedStage.input)
    this.floodStage = this.createStage()
    this.floodStage.material.colorNode = this.buildFloodNode(this.floodStage.input)
    this.rebuildEffectNode()
  }

  private createStage(): Stage {
    const material = new THREE.MeshBasicNodeMaterial()
    material.blending = THREE.NoBlending
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(mesh)
    return { input: tslTexture(this.placeholder, renderTargetUv()), material, scene }
  }

  private mask(color: Node): Node {
    const alpha = clamp(float(color.a), 0, 1)
    const tone = perceptualLuma(color)
    const mode = this.sourceUniform
    const value = select(
      mode.lessThan(0.5),
      alpha,
      select(mode.lessThan(1.5), float(1).sub(tone).mul(alpha), tone.mul(alpha))
    )
    return step(this.thresholdUniform, value)
  }

  private buildSeedNode(input: Node): Node {
    const sourceUv = renderTargetUv()
    const texel = this.texelUniform
    const at = (dx: number, dy: number) =>
      this.mask(input.sample(sourceUv.add(vec2(texel.x.mul(dx), texel.y.mul(dy)))))
    const center = at(0, 0)
    const boundary = center
      .mul(float(1).sub(min(min(at(1, 0), at(-1, 0)), min(at(0, 1), at(0, -1)))))
      .greaterThan(0.5)
    const pixel = sourceUv.div(texel)
    const spacing = max(this.spacingUniform.mul(this.scaleUniform), float(2))
    const crossX = abs(floor(pixel.x.div(spacing)).sub(floor(pixel.x.sub(1).div(spacing)))).greaterThan(0.5)
    const crossY = abs(floor(pixel.y.div(spacing)).sub(floor(pixel.y.sub(1).div(spacing)))).greaterThan(0.5)
    const sparse = boundary.and(crossX.or(crossY))
    const far = vec2(FAR)
    return vec4(select(boundary, pixel, far), select(sparse, pixel, far))
  }

  private buildFloodNode(input: Node): Node {
    return Fn(() => {
      const sourceUv = renderTargetUv()
      const texel = this.texelUniform
      const pixel = sourceUv.div(texel)
      const best = vec4(FAR).toVar()
      const bestFull = float(FAR * 4).toVar()
      const bestSparse = float(FAR * 4).toVar()
      for (let y = -1; y <= 1; y += 1) {
        for (let x = -1; x <= 1; x += 1) {
          const candidate = input.sample(
            sourceUv.add(vec2(texel.x.mul(x), texel.y.mul(y)).mul(this.stepUniform))
          )
          const full = length(vec2(candidate.x, candidate.y).sub(pixel))
          const sparse = length(vec2(candidate.z, candidate.w).sub(pixel))
          const closerFull = full.lessThan(bestFull)
          best.assign(vec4(select(closerFull, vec2(candidate.x, candidate.y), best.xy), best.zw))
          bestFull.assign(select(closerFull, full, bestFull))
          const closerSparse = sparse.lessThan(bestSparse)
          best.assign(vec4(best.xy, select(closerSparse, vec2(candidate.z, candidate.w), best.zw)))
          bestSparse.assign(select(closerSparse, sparse, bestSparse))
        }
      }
      return best
    })()
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.outputHeight = Math.max(1, height)
    this.ping.setSize(this.outputWidth, this.outputHeight)
    this.pong.setSize(this.outputWidth, this.outputHeight)
    ;(this.texelUniform.value as THREE.Vector2).set(1 / this.outputWidth, 1 / this.outputHeight)
    this.syncScale()
  }

  override updateLogicalSize(width: number, _height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.syncScale()
  }

  private syncScale(): void {
    this.scaleUniform.value = this.outputWidth / this.logicalWidth
  }

  override updateParams(params: LayerParameterValues): void {
    this.sourceUniform.value = SOURCES[String(params.source)] ?? 0
    this.thresholdUniform.value = readNumber(params.threshold, 0.5, 0.01, 1)
    this.styleUniform.value = STYLES[String(params.style)] ?? 0
    const offset = readNumber(params.offset, 6, -60, 200)
    const width = readNumber(params.width, 2, 0.25, 40)
    const rings = Math.round(readNumber(params.rings, 1, 1, 12))
    const gap = readNumber(params.ringGap, 8, 1, 120)
    const spacing = readNumber(params.spacing, 18, 3, 200)
    this.offsetUniform.value = offset
    this.widthUniform.value = width
    this.ringsUniform.value = rings
    this.ringGapUniform.value = gap
    this.spacingUniform.value = spacing
    this.reach = Math.abs(offset) + width + (rings - 1) * gap + spacing * 1.5 + 4
    ;(this.lineColorUniform.value as THREE.Color).set(readColor(params.lineColor, "#111111"))
    this.fillUniform.value = readNumber(params.fill, 0, 0, 1)
    ;(this.fillColorUniform.value as THREE.Color).set(readColor(params.fillColor, "#ffffff"))
    this.showImageUniform.value = params.showImage === false ? 0 : 1
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.seedStage.input.value = inputTexture
    renderer.setRenderTarget(this.ping)
    renderer.render(this.seedStage.scene, this.camera2)
    let source = this.ping
    let target = this.pong
    const reach = Math.min(MAX_REACH, this.reach * (this.scaleUniform.value as number))
    let stepSize = 2 ** Math.ceil(Math.log2(Math.max(2, reach)))
    while (stepSize >= 1) {
      this.stepUniform.value = stepSize
      this.floodStage.input.value = source.texture
      renderer.setRenderTarget(target)
      renderer.render(this.floodStage.scene, this.camera2)
      ;[source, target] = [target, source]
      stepSize /= 2
    }
    if (this.fieldNode) this.fieldNode.value = source.texture
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override buildEffectNode(): Node {
    if (!this.showImageUniform) {
      return this.inputNode
    }
    const fieldNode = tslTexture(this.placeholder, renderTargetUv())
    this.fieldNode = fieldNode
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode

    return Fn(() => {
      const targetUv = renderTargetUv()
      const pixel = targetUv.div(this.texelUniform)
      const scale = this.scaleUniform
      const field = fieldNode.sample(targetUv)
      const source = colorNode.sample(targetUv)
      const inside = this.mask(source)
      const toBoundary = length(vec2(field.x, field.y).sub(pixel))
      const signed = select(
        inside.greaterThan(0.5),
        toBoundary.add(0.5).negate(),
        toBoundary.sub(0.5)
      ).div(scale)
      const style = this.styleUniform
      const scalloped = style.greaterThan(2.5)
      const toSeed = length(vec2(field.z, field.w).sub(pixel)).div(scale)
      const radius = max(this.offsetUniform, this.spacingUniform.mul(0.6))
      const cloud = min(signed, toSeed.sub(radius))
      const base = select(scalloped, cloud, signed.sub(this.offsetUniform))

      const half = this.widthUniform.mul(0.5)
      const aa = float(0.75).div(scale)
      const line = float(0).toVar()
      const gap = this.ringGapUniform
      for (let ring = 0; ring < 12; ring += 1) {
        const active = step(float(ring + 0.5), this.ringsUniform)
        const distance = abs(base.sub(gap.mul(ring)))
        const stroke = float(1).sub(smoothstep(half.sub(aa), half.add(aa), distance))
        line.assign(max(line, stroke.mul(active)))
      }
      const doubled = style.greaterThan(0.5).and(style.lessThan(1.5))
      const second = float(1).sub(
        smoothstep(half.sub(aa), half.add(aa), abs(base.sub(half.mul(2).add(this.widthUniform.mul(1.5)))))
      )
      line.assign(select(doubled, max(line, second), line))
      const dashed = style.greaterThan(1.5).and(style.lessThan(2.5))
      const cell = floor(vec2(field.z, field.w).div(max(this.spacingUniform.mul(scale), float(2))))
      const parity = fract(cell.x.add(cell.y).mul(0.5)).mul(2)
      line.assign(select(dashed, line.mul(step(0.5, parity)), line))

      const filled = step(base, float(0))
        .mul(float(1).sub(inside))
        .mul(this.fillUniform)
      const image = vec3(source.r, source.g, source.b)
      const imageAlpha = clamp(float(source.a), 0, 1).mul(this.showImageUniform)
      const withFill = mix(image.mul(imageAlpha), vec3(this.fillColorUniform), filled)
      const fillAlpha = mix(imageAlpha, float(1), filled)
      const rgb = mix(withFill, vec3(this.lineColorUniform), line)
      const alpha = mix(fillAlpha, float(1), line)
      return vec4(rgb.div(max(alpha, float(0.0001))), alpha)
    })()
  }

  override dispose(): void {
    this.ping.dispose()
    this.pong.dispose()
    for (const stage of [this.seedStage, this.floodStage]) {
      stage.material.dispose()
      stage.scene.clear()
    }
    this.geometry.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
