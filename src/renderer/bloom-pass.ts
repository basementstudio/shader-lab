import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  float,
  max,
  smoothstep,
  type TSLNode,
  uniform,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class BloomPass extends PassNode {
  private bloomNode: ReturnType<typeof bloom> | null = null
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

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value =
        this.normalizeBloomSoftness(nextBloomSoftness)
    }
  }

  override dispose(): void {
    this.disposeBloomNode()
    super.dispose()
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

    this.disposeBloomNode()
    this.bloomNode = null

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

    this.bloomNode = bloom(
      vec4(extractedHighlights, float(1)),
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number,
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number,
    )

    return vec4(
      clamp(
        baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      ),
      float(1),
    )
  }

  private normalizeBloomRadius(value: number): number {
    return clamp01(value / 24)
  }

  private normalizeBloomSoftness(value: number): number {
    return Math.max(0.001, value * 0.25)
  }

  private disposeBloomNode(): void {
    ;(this.bloomNode as { dispose?: () => void } | null)?.dispose?.()
  }

  private getBloomTextureNode(): Node {
    const bloomNode = this.bloomNode as
      | ({
          getTexture?: () => Node
          getTextureNode?: () => Node
        } & object)
      | null

    if (!bloomNode) {
      throw new Error("Bloom node is not initialized")
    }

    if ("getTextureNode" in bloomNode && typeof bloomNode.getTextureNode === "function") {
      return bloomNode.getTextureNode()
    }

    if ("getTexture" in bloomNode && typeof bloomNode.getTexture === "function") {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }
}
