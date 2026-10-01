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
import { BlurPyramid } from "@/renderer/blur-pyramid"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const CREASES = 4

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

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

/** A degraded photocopy: crushed toner over paper, with speckle, drum streaks, misregistration and folds. */
export class PhotocopyPass extends PassNode {
  private readonly thresholdUniform: Node
  private readonly contrastUniform: Node
  private readonly generationsUniform: Node
  private readonly fillUniform: Node
  private readonly speckleUniform: Node
  private readonly streaksUniform: Node
  private readonly shiftUniform: Node
  private readonly grainUniform: Node
  private readonly creasesUniform: Node
  private readonly seedUniform: Node
  private readonly tonerUniform: Node
  private readonly paperUniform: Node
  private readonly transparentUniform: Node
  private readonly amountUniform: Node
  private readonly documentSizeUniform: Node
  private readonly outputPerDocumentUniform: Node
  private readonly pyramid = new BlurPyramid()
  private readonly placeholder = new THREE.Texture()
  private colorNode: Node | null = null
  private outputWidth = 1
  private logicalWidth = 1

  constructor(layerId: string) {
    super(layerId)
    this.thresholdUniform = uniform(0.5)
    this.contrastUniform = uniform(0.7)
    this.generationsUniform = uniform(2)
    this.fillUniform = uniform(0.4)
    this.speckleUniform = uniform(0.3)
    this.streaksUniform = uniform(0.2)
    this.shiftUniform = uniform(1)
    this.grainUniform = uniform(0.4)
    this.creasesUniform = uniform(0)
    this.seedUniform = uniform(0)
    this.tonerUniform = uniform(new THREE.Color("#141414"))
    this.paperUniform = uniform(new THREE.Color("#efece4"))
    this.transparentUniform = uniform(0)
    this.amountUniform = uniform(1)
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.outputPerDocumentUniform = uniform(1)
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
    this.thresholdUniform.value = readNumber(params.threshold, 0.5, 0, 1)
    this.contrastUniform.value = readNumber(params.contrast, 0.7, 0, 1)
    this.generationsUniform.value = readNumber(params.generations, 2, 1, 8)
    this.fillUniform.value = readNumber(params.fill, 0.4, 0, 1)
    this.speckleUniform.value = readNumber(params.speckle, 0.3, 0, 1)
    this.streaksUniform.value = readNumber(params.streaks, 0.2, 0, 1)
    this.shiftUniform.value = readNumber(params.shift, 1, 0, 20)
    this.grainUniform.value = readNumber(params.grain, 0.4, 0, 1)
    this.creasesUniform.value = readNumber(params.creases, 0, 0, 1)
    this.seedUniform.value = readNumber(params.seed, 0, 0, 999)
    ;(this.tonerUniform.value as THREE.Color).set(readColor(params.tonerColor, "#141414"))
    ;(this.paperUniform.value as THREE.Color).set(readColor(params.paperColor, "#efece4"))
    this.transparentUniform.value = params.paper === "transparent" ? 1 : 0
    this.amountUniform.value = readNumber(params.amount, 1, 0, 1)
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if ((this.amountUniform.value as number) > 0) {
      this.pyramid.render(renderer, inputTexture)
    }
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override buildEffectNode(): Node {
    if (!this.amountUniform) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode

    return Fn(() => {
      const targetUv = renderTargetUv()
      const size = this.documentSizeUniform
      const pixel = targetUv.mul(size)
      const seed = vec2(this.seedUniform.mul(13.7), this.seedUniform.mul(-7.3))
      const extra = this.generationsUniform.sub(1)

      const shift = vec2(this.shiftUniform, this.shiftUniform.mul(-0.35)).mul(
        float(0.6).add(extra.mul(0.4))
      )
      const read = pixel.sub(shift).div(size)
      const blur = extra.mul(0.55).add(0.25)
      const level = this.pyramid.levelFor(blur.mul(this.outputPerDocumentUniform))
      const sample = this.pyramid.sample(colorNode, read, level, true)
      const straight = vec4(sample.rgb.div(max(sample.a, float(0.0001))), sample.a)
      const tone = perceptualLuma(straight)
      const inside = step(0, read.x)
        .mul(step(read.x, 1))
        .mul(step(0, read.y))
        .mul(step(read.y, 1))

      const mottle = valueNoise(pixel.div(38).add(seed))
        .mul(0.6)
        .add(valueNoise(pixel.div(11).add(seed.mul(2))).mul(0.4))
      const grain = hash(floor(pixel).add(seed)).sub(0.5)
      const noisyTone = tone
        .add(grain.mul(this.grainUniform).mul(0.18))
        .add(mottle.sub(0.5).mul(this.fillUniform).mul(0.25))

      const crush = mix(float(0.45), float(0.015), this.contrastUniform).div(
        float(1).add(extra.mul(0.25))
      )
      let toner: Node = float(1).sub(
        smoothstep(
          this.thresholdUniform.sub(crush),
          this.thresholdUniform.add(crush),
          noisyTone
        )
      )
      const patchy = mix(float(1), mottle.mul(0.5).add(0.62), this.fillUniform)
      toner = clamp(toner.mul(patchy), 0, 1).mul(inside)

      const speckleRate = this.speckleUniform.mul(float(0.012).add(extra.mul(0.006)))
      const dust = step(hash(floor(pixel.div(1.5)).add(seed.add(3.1))), speckleRate)
      const holes = step(hash(floor(pixel.div(1.2)).add(seed.add(8.7))), speckleRate.mul(1.6))
      toner = max(toner, dust)
      toner = toner.mul(float(1).sub(holes))

      const column = floor(pixel.x.div(2))
      const streakPick = step(
        hash(vec2(column, this.seedUniform.add(4.4))),
        this.streaksUniform.mul(0.05)
      )
      const streakRun = smoothstep(
        0.25,
        0.75,
        valueNoise(vec2(column.mul(0.37), pixel.y.div(90)).add(seed))
      )
      const band = valueNoise(vec2(pixel.x.div(220), 1.7).add(seed)).mul(
        this.streaksUniform.mul(0.18)
      )
      toner = max(toner, streakPick.mul(streakRun).mul(0.85))
      toner = clamp(toner.add(band.mul(float(1).sub(toner)).mul(0.6)), 0, 1)

      let crease: Node = float(0)
      let creaseLight: Node = float(0)
      for (let index = 0; index < CREASES; index += 1) {
        const angle = hash(vec2(index * 3.1, this.seedUniform.add(1.9))).mul(Math.PI)
        const offset = hash(vec2(index * 5.7, this.seedUniform.add(6.2)))
          .sub(0.5)
          .mul(min(size.x, size.y))
          .mul(0.8)
        const normal = vec2(cos(angle), sin(angle))
        const distance = dot(pixel.sub(size.mul(0.5)), normal).sub(offset)
        const active = step(float(index + 0.5), this.creasesUniform.mul(CREASES))
        const wobble = valueNoise(vec2(dot(pixel, vec2(normal.y.negate(), normal.x)).div(40), index).add(seed))
          .sub(0.5)
          .mul(3)
        const d = distance.add(wobble)
        crease = max(crease, float(1).sub(smoothstep(0, 2.2, abs(d))).mul(active))
        creaseLight = max(
          creaseLight,
          float(1).sub(smoothstep(0, 9, abs(d.sub(3)))).mul(step(0, d)).mul(active)
        )
      }
      toner = clamp(toner.add(crease.mul(0.55)), 0, 1)

      const paperBase = vec3(this.paperUniform)
      const paperTexture = valueNoise(pixel.div(2.3).add(seed.mul(3)))
        .sub(0.5)
        .mul(this.grainUniform)
        .mul(0.05)
      const paper = clamp(
        paperBase.add(paperTexture).add(creaseLight.mul(0.05)).sub(crease.mul(0.08)),
        0,
        1
      )
      const inkColor = vec3(this.tonerUniform)
      const onPaper = mix(paper, inkColor, toner)
      const transparent = this.transparentUniform.greaterThan(0.5)
      const rgb = select(transparent, inkColor, onPaper)
      const alpha = select(transparent, toner.mul(sample.a), float(1))
      const original = colorNode.sample(targetUv).level(0)
      const outAlpha = mix(float(original.a), alpha, this.amountUniform)
      const premultiplied = mix(
        vec3(original.r, original.g, original.b),
        rgb.mul(alpha),
        this.amountUniform
      )
      return vec4(premultiplied.div(max(outAlpha, float(0.0001))), outAlpha)
    })()
  }

  override dispose(): void {
    this.pyramid.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
