import {
  dot,
  float,
  floor,
  fract,
  mix,
  pow,
  select,
  sin,
  step,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import type * as THREE from "three/webgpu"
import type { LayerParameterValues } from "../types/editor"
import { createPipelinePlaceholder, PassNode } from "./pass-node"

type Node = TSLNode

const SLICE_DIRECTION_BOTH = 0
const SLICE_DIRECTION_RIGHT = 1
const SLICE_DIRECTION_LEFT = 2

function hash2(x: Node, y: Node): Node {
  return fract(sin(dot(vec2(x, y), vec2(127.1, 311.7))).mul(43758.5453123))
}

function toSliceDirection(value: unknown): number {
  switch (value) {
    case "left":
      return SLICE_DIRECTION_LEFT
    case "both":
      return SLICE_DIRECTION_BOTH
    default:
      return SLICE_DIRECTION_RIGHT
  }
}

export class SlicePass extends PassNode {
  private readonly amountUniform: Node
  private readonly sliceHeightUniform: Node
  private readonly blockWidthUniform: Node
  private readonly densityUniform: Node
  private readonly dispersionUniform: Node
  private readonly speedUniform: Node
  private readonly directionUniform: Node
  private readonly timeUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private speedValue = 0.2
  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.amountUniform = uniform(180)
    this.sliceHeightUniform = uniform(28)
    this.blockWidthUniform = uniform(120)
    this.densityUniform = uniform(0.58)
    this.dispersionUniform = uniform(0.18)
    this.speedUniform = uniform(0.2)
    this.directionUniform = uniform(SLICE_DIRECTION_RIGHT)
    this.timeUniform = uniform(0)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
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

  override resize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.amountUniform.value =
      typeof params.amount === "number"
        ? Math.max(0, Math.min(480, params.amount))
        : 180
    this.sliceHeightUniform.value =
      typeof params.sliceHeight === "number"
        ? Math.max(2, Math.min(240, Math.round(params.sliceHeight)))
        : 28
    this.blockWidthUniform.value =
      typeof params.blockWidth === "number"
        ? Math.max(8, Math.min(640, Math.round(params.blockWidth)))
        : 120
    this.densityUniform.value =
      typeof params.density === "number"
        ? Math.max(0, Math.min(1, params.density))
        : 0.58
    this.dispersionUniform.value =
      typeof params.dispersion === "number"
        ? Math.max(0, Math.min(0.5, params.dispersion))
        : 0.18

    this.speedValue =
      typeof params.speed === "number"
        ? Math.max(0, Math.min(2, params.speed))
        : 0.2
    this.speedUniform.value = this.speedValue
    this.directionUniform.value = toSliceDirection(params.direction)
  }

  override needsContinuousRender(): boolean {
    return this.speedValue > 0.0001
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.amountUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const pixelCoord = vec2(
      renderTargetUv.x.mul(this.widthUniform),
      renderTargetUv.y.mul(this.heightUniform)
    )
    const sliceIndex = floor(pixelCoord.y.div(this.sliceHeightUniform))
    const blockIndex = floor(pixelCoord.x.div(this.blockWidthUniform))
    const timeBucket = floor(
      this.timeUniform.mul(this.speedUniform).mul(float(6))
    )
    const bandNoise = hash2(
      sliceIndex.add(float(0.37)),
      timeBucket.add(float(11.13))
    )
    const blockNoise = hash2(
      blockIndex.add(timeBucket.mul(float(0.73))).add(float(2.4)),
      sliceIndex.add(float(19.7))
    )
    const gate = step(float(1).sub(this.densityUniform), blockNoise)
    const randomDirection = hash2(
      sliceIndex.add(float(7.2)),
      timeBucket.add(float(31.4))
    )
      .mul(float(2))
      .sub(float(1))
    const signedDirection = select(
      this.directionUniform.greaterThan(float(1.5)),
      float(-1),
      select(
        this.directionUniform.greaterThan(float(0.5)),
        float(1),
        randomDirection
      )
    )
    const sliceStrength = pow(bandNoise, float(1.35))
      .mul(this.amountUniform)
      .mul(gate)
    const offsetUv = vec2(
      sliceStrength.mul(signedDirection).div(this.widthUniform),
      float(0)
    )
    const chromaOffsetUv = vec2(
      offsetUv.x.mul(this.dispersionUniform),
      float(0)
    )
    const trailOffsetUv = vec2(offsetUv.x.mul(float(0.35)), float(0))

    const redSample = this.trackSourceTextureNode(
      vec2(
        renderTargetUv.x.add(offsetUv.x).add(chromaOffsetUv.x),
        renderTargetUv.y
      )
    )
    const greenSample = this.trackSourceTextureNode(
      vec2(renderTargetUv.x.add(offsetUv.x), renderTargetUv.y)
    )
    const blueSample = this.trackSourceTextureNode(
      vec2(
        renderTargetUv.x.add(offsetUv.x).sub(chromaOffsetUv.x),
        renderTargetUv.y
      )
    )
    const trailSample = this.trackSourceTextureNode(
      vec2(renderTargetUv.x.add(trailOffsetUv.x), renderTargetUv.y)
    )

    const slicedColor = vec3(redSample.r, greenSample.g, blueSample.b)
    const smearMix = gate.mul(bandNoise.mul(float(0.42)).add(float(0.18)))

    return vec4(mix(slicedColor, trailSample.rgb, smearMix), float(1))
  }
}
