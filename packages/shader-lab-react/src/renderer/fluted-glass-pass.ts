import {
  abs,
  clamp,
  cos,
  float,
  max,
  mix,
  pow,
  sin,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { LayerParameterValues } from "../types/editor"
import { PassNode } from "./pass-node"

type Node = TSLNode

export class FlutedGlassPass extends PassNode {
  private readonly frequencyUniform: Node
  private readonly amplitudeUniform: Node
  private readonly angleUniform: Node
  private readonly chromaticSplitUniform: Node

  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.frequencyUniform = uniform(20)
    this.amplitudeUniform = uniform(0.02)
    this.angleUniform = uniform(0)
    this.chromaticSplitUniform = uniform(0.3)
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

  override updateParams(params: LayerParameterValues): void {
    this.frequencyUniform.value =
      typeof params.frequency === "number"
        ? Math.max(2, Math.min(100, params.frequency))
        : 20
    this.amplitudeUniform.value =
      typeof params.amplitude === "number"
        ? Math.max(0, Math.min(0.1, params.amplitude))
        : 0.02
    this.angleUniform.value =
      typeof params.angle === "number"
        ? Math.max(0, Math.min(360, params.angle))
        : 0
    this.chromaticSplitUniform.value =
      typeof params.chromaticSplit === "number"
        ? Math.max(0, Math.min(1, params.chromaticSplit))
        : 0.3
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.frequencyUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const angleRadians = this.angleUniform.mul(Math.PI / 180)
    const cosA = cos(angleRadians)
    const sinA = sin(angleRadians)
    const projected = renderTargetUv.x.mul(cosA).add(renderTargetUv.y.mul(sinA))
    const phase = projected.mul(this.frequencyUniform).mul(Math.PI)
    const ribWave = sin(phase)
    const ribEnvelope = abs(ribWave)
    const lensProfile = ribWave.mul(ribEnvelope.mul(0.7).add(0.3))
    const slope = cos(phase)
    const perpX = sinA.negate()
    const perpY = cosA
    const baseDisp = lensProfile.mul(this.amplitudeUniform)
    const splitAmount = this.chromaticSplitUniform
      .mul(this.amplitudeUniform)
      .mul(float(0.35))
      .mul(pow(ribEnvelope, float(1.35)))
    const dispR = baseDisp.add(splitAmount)
    const dispG = baseDisp
    const dispB = baseDisp.sub(splitAmount)
    const centerUv = vec2(
      clamp(renderTargetUv.x, float(0), float(1)),
      clamp(renderTargetUv.y, float(0), float(1))
    )
    const uvR = vec2(
      clamp(renderTargetUv.x.add(perpX.mul(dispR)), float(0), float(1)),
      clamp(renderTargetUv.y.add(perpY.mul(dispR)), float(0), float(1))
    )
    const uvG = vec2(
      clamp(renderTargetUv.x.add(perpX.mul(dispG)), float(0), float(1)),
      clamp(renderTargetUv.y.add(perpY.mul(dispG)), float(0), float(1))
    )
    const uvB = vec2(
      clamp(renderTargetUv.x.add(perpX.mul(dispB)), float(0), float(1)),
      clamp(renderTargetUv.y.add(perpY.mul(dispB)), float(0), float(1))
    )
    const centerSample = this.trackSourceTextureNode(centerUv)
    const sampleR = this.trackSourceTextureNode(uvR)
    const sampleG = this.trackSourceTextureNode(uvG)
    const sampleB = this.trackSourceTextureNode(uvB)
    const displacedColor = vec3(sampleR.r, sampleG.g, sampleB.b)
    const sourceColor = vec3(centerSample.r, centerSample.g, centerSample.b)
    const glassAmount = clamp(this.amplitudeUniform.mul(22), float(0), float(1))
    const mixedColor = mix(
      sourceColor,
      displacedColor,
      glassAmount.mul(0.9).add(0.08)
    )
    const sheen = pow(max(slope, float(0)), float(4))
      .mul(glassAmount)
      .mul(0.1)
      .mul(ribEnvelope.mul(0.75).add(0.25))
    const finalColor = clamp(
      mixedColor.add(vec3(sheen, sheen, sheen)),
      vec3(0, 0, 0),
      vec3(1, 1, 1)
    )

    return vec4(finalColor, float(1))
  }
}
