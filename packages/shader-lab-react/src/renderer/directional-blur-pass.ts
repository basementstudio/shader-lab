import * as THREE from "three/webgpu"
import {
  cos,
  float,
  max,
  min,
  select,
  sin,
  step,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import type { LayerParameterValues } from "../types/editor"
import { createPipelinePlaceholder, PassNode } from "./pass-node"

type Node = TSLNode

const BLUR_MODE_LINEAR = 0
const BLUR_MODE_RADIAL = 1
const MAX_SAMPLES = 16

function toBlurModeValue(value: unknown): number {
  return value === "radial" ? BLUR_MODE_RADIAL : BLUR_MODE_LINEAR
}

export class DirectionalBlurPass extends PassNode {
  private readonly strengthUniform: Node
  private readonly samplesUniform: Node
  private readonly angleUniform: Node
  private readonly modeUniform: Node
  private readonly centerXUniform: Node
  private readonly centerYUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private sourceTextureNodes: Node[] = []
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.strengthUniform = uniform(18)
    this.samplesUniform = uniform(8)
    this.angleUniform = uniform(0)
    this.modeUniform = uniform(BLUR_MODE_LINEAR)
    this.centerXUniform = uniform(0.5)
    this.centerYUniform = uniform(0.5)
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
    this.strengthUniform.value =
      typeof params.strength === "number"
        ? Math.max(0, Math.min(96, params.strength))
        : 18
    this.samplesUniform.value =
      typeof params.samples === "number"
        ? Math.max(1, Math.min(MAX_SAMPLES, Math.round(params.samples)))
        : 8
    this.angleUniform.value =
      typeof params.angle === "number" ? params.angle : 0
    this.modeUniform.value = toBlurModeValue(params.mode)

    if (Array.isArray(params.center) && params.center.length >= 2) {
      this.centerXUniform.value = Math.max(0, Math.min(1, params.center[0]))
      this.centerYUniform.value = Math.max(0, Math.min(1, params.center[1]))
    } else {
      this.centerXUniform.value = 0.5
      this.centerYUniform.value = 0.5
    }
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.strengthUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const angleRadians = this.angleUniform.mul(Math.PI / 180)
    const linearDirection = vec2(cos(angleRadians), sin(angleRadians))
    const centerUv = vec2(this.centerXUniform, this.centerYUniform)
    const centeredUv = vec2(
      renderTargetUv.x.sub(centerUv.x),
      renderTargetUv.y.sub(centerUv.y)
    )
    const minDimension = min(this.widthUniform, this.heightUniform)
    const linearOffset = vec2(
      linearDirection.x.mul(this.strengthUniform.div(this.widthUniform)),
      linearDirection.y.mul(this.strengthUniform.div(this.heightUniform))
    )
    const radialOffset = vec2(
      centeredUv.x.mul(this.strengthUniform.div(minDimension)),
      centeredUv.y.mul(this.strengthUniform.div(minDimension))
    )
    const isRadial = this.modeUniform.greaterThan(float(0.5))

    let accumR = float(0)
    let accumG = float(0)
    let accumB = float(0)
    let weightSum = float(0)

    for (let index = 0; index < MAX_SAMPLES; index += 1) {
      const t = index / (MAX_SAMPLES - 1) - 0.5
      const offsetX = vec2(
        linearOffset.x.mul(t),
        radialOffset.x.mul(t)
      )
      const offsetY = vec2(
        linearOffset.y.mul(t),
        radialOffset.y.mul(t)
      )
      const sampleUv = vec2(
        renderTargetUv.x.add(select(isRadial, offsetX.y, offsetX.x)),
        renderTargetUv.y.add(select(isRadial, offsetY.y, offsetY.x))
      )
      const sample = this.trackSourceTextureNode(sampleUv)
      const activeWeight = step(float(index + 0.5), this.samplesUniform)
      accumR = accumR.add(float(sample.r).mul(activeWeight))
      accumG = accumG.add(float(sample.g).mul(activeWeight))
      accumB = accumB.add(float(sample.b).mul(activeWeight))
      weightSum = weightSum.add(activeWeight)
    }

    const safeWeight = max(weightSum, float(1))
    return vec4(
      vec3(accumR.div(safeWeight), accumG.div(safeWeight), accumB.div(safeWeight)),
      float(1)
    )
  }
}
