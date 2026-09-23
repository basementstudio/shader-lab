import {
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  pow,
  select,
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

function hash(p: Node): Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031))
  const shifted = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(shifted.x.add(shifted.y).mul(shifted.z))
}

function noise1(x: Node, lane: number): Node {
  const cell = floor(x)
  const local = fract(x)
  const eased = local.mul(local).mul(float(3).sub(local.mul(2)))
  return mix(hash(vec2(cell, lane)), hash(vec2(cell.add(1), lane)), eased)
}

function fbm1(x: Node, lane: number): Node {
  return noise1(x, lane)
    .mul(0.6)
    .add(noise1(x.mul(2.3).add(17.1), lane + 1).mul(0.3))
    .add(noise1(x.mul(5.1).add(3.7), lane + 2).mul(0.1))
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

export class SignalRotPass extends PassNode {
  private readonly verticalUniform: Node
  private readonly dragUniform: Node
  private readonly dragLengthUniform: Node
  private readonly stretchUniform: Node
  private readonly wobbleUniform: Node
  private readonly wobbleScaleUniform: Node
  private readonly tearUniform: Node
  private readonly bandSizeUniform: Node
  private readonly dropoutUniform: Node
  private readonly dropoutColorUniform: Node
  private readonly chromaUniform: Node
  private readonly crushUniform: Node
  private readonly lineNoiseUniform: Node
  private readonly seedUniform: Node
  private readonly timeUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly placeholder = new THREE.Texture()
  private sourceTextureNodes: Node[] = []
  private speed = 0

  constructor(layerId: string) {
    super(layerId)
    this.verticalUniform = uniform(1)
    this.dragUniform = uniform(0)
    this.dragLengthUniform = uniform(0.3)
    this.stretchUniform = uniform(0)
    this.wobbleUniform = uniform(0)
    this.wobbleScaleUniform = uniform(0.5)
    this.tearUniform = uniform(0)
    this.bandSizeUniform = uniform(0.12)
    this.dropoutUniform = uniform(0)
    this.dropoutColorUniform = uniform(new THREE.Color("#ffffff"))
    this.chromaUniform = uniform(0)
    this.crushUniform = uniform(0)
    this.lineNoiseUniform = uniform(0)
    this.seedUniform = uniform(0)
    this.timeUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.verticalUniform.value = params.direction === "horizontal" ? 0 : 1
    this.dragUniform.value = readNumber(params.drag, 0, 0, 1)
    this.dragLengthUniform.value = readNumber(params.dragLength, 0.3, 0.01, 1)
    this.stretchUniform.value = readNumber(params.stretch, 0, 0, 1)
    this.wobbleUniform.value = readNumber(params.wobble, 0, 0, 1)
    this.wobbleScaleUniform.value = readNumber(params.wobbleScale, 0.5, 0.02, 2)
    this.tearUniform.value = readNumber(params.tear, 0, 0, 1)
    this.bandSizeUniform.value = readNumber(params.bandSize, 0.12, 0.01, 0.5)
    this.dropoutUniform.value = readNumber(params.dropout, 0, 0, 1)
    ;(this.dropoutColorUniform.value as THREE.Color).set(
      typeof params.dropoutColor === "string" ? params.dropoutColor : "#ffffff"
    )
    this.chromaUniform.value = readNumber(params.chroma, 0, 0, 1)
    this.crushUniform.value = readNumber(params.crush, 0, 0, 1)
    this.lineNoiseUniform.value = readNumber(params.lineNoise, 0, 0, 1)
    this.seedUniform.value = readNumber(params.seed, 0, 0, 9999)
    this.speed = readNumber(params.speed, 0, 0, 4)
  }

  override needsContinuousRender(): boolean {
    return this.speed > 0.0001
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = this.speed > 0 ? time * this.speed : 0
  }

  private sample(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.logicalHeightUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const targetUv = vec2(uv().x, float(1).sub(uv().y))
    const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
    const pixel = targetUv.mul(size)
    const vertical = this.verticalUniform.greaterThan(float(0.5))
    const along = select(vertical, pixel.y, pixel.x)
    const across = select(vertical, pixel.x, pixel.y)
    const alongSize = select(vertical, size.y, size.x)
    const acrossSize = select(vertical, size.x, size.y)
    const shortSide = min(size.x, size.y)
    const seed = this.seedUniform.mul(7.31)
    const time = this.timeUniform
    const step8 = floor(time.mul(8))

    const band = this.bandSizeUniform.mul(alongSize)
    const raggedAlong = along.add(
      fbm1(across.div(shortSide.mul(0.08)).add(seed), 11)
        .sub(0.5)
        .mul(band.mul(0.4))
        .add(noise1(across.div(3).add(seed), 14).sub(0.5).mul(band.mul(0.04)))
    )
    const bandIndex = floor(raggedAlong.div(band))
    const bandKey = vec2(bandIndex.add(seed), step8)
    const tearShift = hash(bandKey)
      .sub(0.5)
      .mul(2)
      .mul(this.tearUniform)
      .mul(acrossSize)
      .mul(0.3)
      .mul(step(hash(bandKey.add(4.1)), this.tearUniform.mul(0.6).add(0.4)))
    let acrossSample: Node = across.add(tearShift)

    const dropoutEdge = hash(bandKey.add(9.7))
      .mul(0.7)
      .add(fbm1(along.div(19).add(seed), 23).sub(0.5).mul(0.06))
      .add(hash(vec2(floor(along.div(1.5)), seed.add(23))).mul(0.012))
    const dropped = step(hash(bandKey.add(2.3)), this.dropoutUniform)
      .mul(step(across.div(acrossSize), dropoutEdge))
      .mul(step(float(0.0001), this.dropoutUniform))

    const wobbleScale = this.wobbleScaleUniform.mul(shortSide)
    acrossSample = acrossSample.add(
      fbm1(along.div(wobbleScale).add(seed).add(time.mul(0.6)), 31)
        .sub(0.5)
        .mul(2)
        .mul(this.wobbleUniform)
        .mul(shortSide)
        .mul(0.12)
    )

    let alongSample: Node = along.add(
      fbm1(along.div(shortSide.mul(0.45)).add(seed.mul(1.3)), 41)
        .sub(0.5)
        .mul(this.stretchUniform)
        .mul(shortSide)
        .mul(0.35)
    )

    const dragLength = this.dragLengthUniform.mul(alongSize)
    const front = fbm1(across.div(shortSide.mul(0.12)).add(seed), 51)
      .mul(0.35)
      .add(noise1(across.div(4).add(seed), 54).mul(0.03))
      .mul(dragLength)
    const segment = floor(alongSample.add(front).div(dragLength))
    const held = step(hash(vec2(segment.add(seed), step8.mul(3))), this.dragUniform)
      .mul(step(float(0.0001), this.dragUniform))
    const holdAt = segment.mul(dragLength).sub(front)
    alongSample = mix(alongSample, holdAt, held)

    const line = floor(across.div(2))
    const jitterKey = vec2(line.add(seed), step8.add(1))
    alongSample = alongSample.add(
      hash(jitterKey)
        .sub(0.5)
        .mul(this.lineNoiseUniform)
        .mul(shortSide)
        .mul(0.06)
        .mul(step(hash(jitterKey.add(6.6)), this.lineNoiseUniform.mul(0.5)))
    )

    const toUv = (a: Node, c: Node) =>
      select(vertical, vec2(c, a), vec2(a, c)).div(size)
    const chroma = this.chromaUniform.mul(shortSide).mul(0.02)
    const centerSample = this.sample(toUv(alongSample, acrossSample))
    const redSample = this.sample(toUv(alongSample.add(chroma), acrossSample))
    const blueSample = this.sample(toUv(alongSample.sub(chroma), acrossSample))
    let color: Node = vec3(
      float(redSample.r),
      float(centerSample.g),
      float(blueSample.b)
    )

    const levels = mix(float(64), float(3), this.crushUniform)
    const encoded = pow(max(color, vec3(0)), vec3(1 / 2.2))
    const crushed = pow(floor(encoded.mul(levels).add(0.5)).div(levels), vec3(2.2))
    color = mix(color, crushed, step(float(0.0001), this.crushUniform))

    const lineGain = hash(vec2(line.add(seed.mul(2)), step8.add(2)))
      .sub(0.5)
      .mul(this.lineNoiseUniform)
      .mul(0.35)
    color = mix(
      color,
      clamp(color.add(lineGain), 0, 1),
      step(float(0.0001), this.lineNoiseUniform)
    )

    color = mix(color, this.dropoutColorUniform, dropped)
    return vec4(color, float(1))
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
