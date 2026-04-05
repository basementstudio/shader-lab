import {
  clamp,
  cos,
  dot,
  float,
  fract,
  max,
  min,
  pow,
  sin,
  smoothstep,
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

const MAX_SAMPLES = 32
const TWO_PI = Math.PI * 2

function random(coordinate: Node): Node {
  return fract(sin(dot(coordinate, vec2(12.9898, 78.233))).mul(43758.5453))
}

export class SmearPass extends PassNode {
  private readonly angleUniform: Node
  private readonly startUniform: Node
  private readonly endUniform: Node
  private readonly strengthUniform: Node
  private readonly samplesUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.angleUniform = uniform(0)
    this.startUniform = uniform(0.25)
    this.endUniform = uniform(0.75)
    this.strengthUniform = uniform(24)
    this.samplesUniform = uniform(12)
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
    this.angleUniform.value =
      typeof params.angle === "number"
        ? Math.max(0, Math.min(360, params.angle))
        : 0
    this.startUniform.value =
      typeof params.start === "number"
        ? Math.max(0, Math.min(1, params.start))
        : 0.25
    this.endUniform.value =
      typeof params.end === "number"
        ? Math.max(0, Math.min(1, params.end))
        : 0.75
    this.strengthUniform.value =
      typeof params.strength === "number"
        ? Math.max(0, Math.min(64, params.strength))
        : 24
    this.samplesUniform.value =
      typeof params.samples === "number"
        ? Math.max(4, Math.min(MAX_SAMPLES, Math.round(params.samples)))
        : 12
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.angleUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const pixelCoord = vec2(
      renderTargetUv.x.mul(this.widthUniform),
      renderTargetUv.y.mul(this.heightUniform)
    )
    const angleRadians = this.angleUniform.mul(Math.PI / 180)
    const cosA = cos(angleRadians)
    const sinA = sin(angleRadians)
    const blurDirection = vec2(cosA, sinA)
    const perpendicularDirection = vec2(sinA.negate(), cosA)
    const projected = renderTargetUv.x.mul(cosA).add(renderTargetUv.y.mul(sinA))
    const safeStart = min(this.startUniform, this.endUniform)
    const safeEnd = max(this.startUniform, this.endUniform)
    const blurAmount = smoothstep(safeStart, safeEnd, projected)
    const blurRadius = blurAmount.mul(this.strengthUniform)

    const centerSample = this.trackSourceTextureNode(renderTargetUv)

    let accumR = float(centerSample.r)
    let accumG = float(centerSample.g)
    let accumB = float(centerSample.b)
    let weightSum = float(1)

    for (let index = 0; index < MAX_SAMPLES; index += 1) {
      const activeWeight = step(float(index + 0.5), this.samplesUniform)
      const sampleProgress = float((index + 1) / MAX_SAMPLES)
      const jitterAngle = random(
        vec2(
          pixelCoord.x.add(float(index * 17.13 + 1.7)),
          pixelCoord.y.add(float(index * 5.71 + 8.3))
        )
      ).mul(TWO_PI)
      const jitterRadius = random(
        vec2(
          pixelCoord.y.add(float(index * 11.37 + 3.1)),
          pixelCoord.x.add(float(index * 7.17 + 13.9))
        )
      )
      const radialWeight = pow(sampleProgress, float(0.82))
      const axisX = blurDirection.x
        .mul(cos(jitterAngle))
        .add(perpendicularDirection.x.mul(sin(jitterAngle).mul(0.65)))
      const axisY = blurDirection.y
        .mul(cos(jitterAngle))
        .add(perpendicularDirection.y.mul(sin(jitterAngle).mul(0.65)))
      const sampleRadius = blurRadius.mul(
        radialWeight.mul(0.8).add(jitterRadius.mul(0.35))
      )
      const sampleUv = vec2(
        clamp(
          renderTargetUv.x.add(axisX.mul(sampleRadius).div(this.widthUniform)),
          float(0),
          float(1)
        ),
        clamp(
          renderTargetUv.y.add(axisY.mul(sampleRadius).div(this.heightUniform)),
          float(0),
          float(1)
        )
      )
      const sample = this.trackSourceTextureNode(sampleUv)
      const sampleWeight = activeWeight.mul(
        max(float(0.35), float(1.1).sub(radialWeight.mul(0.7)))
      )
      accumR = accumR.add(float(sample.r).mul(sampleWeight))
      accumG = accumG.add(float(sample.g).mul(sampleWeight))
      accumB = accumB.add(float(sample.b).mul(sampleWeight))
      weightSum = weightSum.add(sampleWeight)
    }

    const safeWeight = max(weightSum, float(1))
    return vec4(
      vec3(
        accumR.div(safeWeight),
        accumG.div(safeWeight),
        accumB.div(safeWeight)
      ),
      float(1)
    )
  }
}
