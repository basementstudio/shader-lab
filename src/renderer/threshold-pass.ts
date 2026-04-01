import {
  clamp,
  dot,
  float,
  fract,
  select,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

function random(coordinate: Node): Node {
  return fract(
    sin(coordinate.x.mul(12.9898).add(coordinate.y.mul(78.233))).mul(43758.5453)
  )
}

export class ThresholdPass extends PassNode {
  private readonly thresholdUniform: Node
  private readonly softnessUniform: Node
  private readonly noiseUniform: Node
  private readonly invertUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  constructor(layerId: string) {
    super(layerId)
    this.thresholdUniform = uniform(0.5)
    this.softnessUniform = uniform(0.02)
    this.noiseUniform = uniform(0.08)
    this.invertUniform = uniform(0)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override resize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.thresholdUniform.value =
      typeof params.threshold === "number"
        ? Math.max(0, Math.min(1, params.threshold))
        : 0.5
    this.softnessUniform.value =
      typeof params.softness === "number"
        ? Math.max(0, Math.min(0.2, params.softness))
        : 0.02
    this.noiseUniform.value =
      typeof params.noise === "number"
        ? Math.max(0, Math.min(0.3, params.noise))
        : 0.08
    this.invertUniform.value = params.invert === true ? 1 : 0
  }

  protected override buildEffectNode(): Node {
    if (!this.thresholdUniform) {
      return this.inputNode
    }

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const pixelCoord = vec2(
      renderTargetUv.x.mul(this.widthUniform),
      renderTargetUv.y.mul(this.heightUniform)
    )
    const sourceColor = vec3(
      float(this.inputNode.r),
      float(this.inputNode.g),
      float(this.inputNode.b)
    )
    const luma = dot(sourceColor, vec3(0.2126, 0.7152, 0.0722))
    const grain = random(pixelCoord)
      .add(random(vec2(pixelCoord.y.add(19.19), pixelCoord.x.add(73.71))))
      .sub(1)
      .mul(this.noiseUniform)
    const thresholded = smoothstep(
      this.thresholdUniform.sub(this.softnessUniform),
      this.thresholdUniform.add(this.softnessUniform),
      clamp(luma.add(grain), float(0), float(1))
    )
    const isInverted = this.invertUniform.greaterThan(float(0.5))
    const output = select(isInverted, float(1).sub(thresholded), thresholded)

    return vec4(vec3(output, output, output), float(1))
  }
}
