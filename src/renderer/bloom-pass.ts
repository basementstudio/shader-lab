import {
  float,
  max,
  smoothstep,
  type TSLNode,
  uniform,
  vec3,
  vec4,
} from "three/tsl"
import { BloomCompositor } from "@/renderer/dual-filter-bloom"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class BloomPass extends PassNode {
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node
  private readonly bloomKneeUniform: Node
  private readonly highlightDriveUniform: Node

  constructor(layerId: string) {
    super(layerId)
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)
    this.bloomKneeUniform = uniform(0.2)
    this.highlightDriveUniform = uniform(1.5)
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number"
        ? Math.max(0, params.bloomIntensity)
        : 1.25
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number"
        ? clamp01(params.bloomThreshold)
        : 0.6
    const nextBloomRadius =
      typeof params.bloomRadius === "number"
        ? Math.max(0, params.bloomRadius)
        : 6
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number"
        ? clamp01(params.bloomSoftness)
        : 0.35
    const nextBloomKnee =
      typeof params.bloomKnee === "number"
        ? Math.max(0, Math.min(0.5, params.bloomKnee))
        : 0.2
    const nextHighlightDrive =
      typeof params.highlightDrive === "number"
        ? Math.max(1, params.highlightDrive)
        : 1.5

    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold
    this.bloomKneeUniform.value = nextBloomKnee
    this.highlightDriveUniform.value = nextHighlightDrive

    this.applyBloomSettings()
  }

  override dispose(): void {
    super.dispose()
  }

  private applyBloomSettings(): void {
    this.bloomCompositor?.applySettings({
      intensity: this.bloomIntensityUniform.value as number,
      radius: this.bloomRadiusUniform.value as number,
      softness: this.bloomSoftnessUniform.value as number,
      threshold: this.bloomThresholdUniform.value as number,
    })
  }

  protected override buildEffectNode(): Node {
    const hasUniforms =
      this.bloomIntensityUniform &&
      this.bloomRadiusUniform &&
      this.bloomSoftnessUniform &&
      this.bloomThresholdUniform &&
      this.bloomKneeUniform &&
      this.highlightDriveUniform

    if (!hasUniforms) {
      return vec4(this.inputNode.rgb, float(1))
    }


    const baseColor = vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b)
    const luma = float(this.inputNode.r)
      .mul(float(0.2126))
      .add(float(this.inputNode.g).mul(float(0.7152)))
      .add(float(this.inputNode.b).mul(float(0.0722)))
    const knee = max(this.bloomKneeUniform, float(0.0001))
    const highlightMask = smoothstep(
      this.bloomThresholdUniform.sub(knee),
      this.bloomThresholdUniform.add(knee),
      luma,
    )
    const extractedHighlights = baseColor
      .mul(highlightMask)
      .mul(this.highlightDriveUniform)

    if (!this.bloomCompositor) {
      this.bloomCompositor = new BloomCompositor()
    }

    this.applyBloomSettings()
    return this.bloomCompositor.build(extractedHighlights, baseColor)
  }

}
