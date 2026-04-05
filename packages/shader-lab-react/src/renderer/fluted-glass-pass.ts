import {
  abs,
  clamp,
  cos,
  float,
  fract,
  floor,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
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
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import { simplexNoise3d } from "./shaders/tsl/noise/simplex-noise-3d"

type Node = TSLNode

const FLUTED_GLASS_PRESET_ARCHITECTURAL = 0
const FLUTED_GLASS_PRESET_PAINTERLY = 1

function toFlutedGlassPresetValue(value: unknown): number {
  if (value === "painterly" || value === "strong") {
    return FLUTED_GLASS_PRESET_PAINTERLY
  }

  return FLUTED_GLASS_PRESET_ARCHITECTURAL
}

export class FlutedGlassPass extends PassNode {
  private readonly presetUniform: Node
  private readonly frequencyUniform: Node
  private readonly amplitudeUniform: Node
  private readonly warpUniform: Node
  private readonly irregularityUniform: Node
  private readonly angleUniform: Node

  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.presetUniform = uniform(FLUTED_GLASS_PRESET_ARCHITECTURAL)
    this.frequencyUniform = uniform(20)
    this.amplitudeUniform = uniform(0.02)
    this.warpUniform = uniform(0.28)
    this.irregularityUniform = uniform(0.35)
    this.angleUniform = uniform(0)
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
    this.presetUniform.value = toFlutedGlassPresetValue(params.preset)
    this.frequencyUniform.value =
      typeof params.frequency === "number"
        ? Math.max(2, Math.min(100, params.frequency))
        : 20
    this.amplitudeUniform.value =
      typeof params.amplitude === "number"
        ? Math.max(0, Math.min(0.1, params.amplitude))
        : 0.02
    this.warpUniform.value =
      typeof params.warp === "number"
        ? Math.max(0, Math.min(1, params.warp))
        : 0.28
    this.irregularityUniform.value =
      typeof params.irregularity === "number"
        ? Math.max(0, Math.min(1, params.irregularity))
        : 0.35
    this.angleUniform.value =
      typeof params.angle === "number"
        ? Math.max(0, Math.min(360, params.angle))
        : 0
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
    const isPainterlyPreset = this.presetUniform.greaterThan(float(0.5))
    const alongAxis = renderTargetUv.x.mul(cosA).add(renderTargetUv.y.mul(sinA))
    const acrossAxis = renderTargetUv.x.mul(sinA.negate()).add(renderTargetUv.y.mul(cosA))
    const coarseNoise = simplexNoise3d(vec3(alongAxis.mul(1.35), acrossAxis.mul(1.1), 0.17))
    const detailNoise = simplexNoise3d(vec3(alongAxis.mul(3.9).add(11.7), acrossAxis.mul(2.4).sub(4.3), 1.91))
    const warpNoise = simplexNoise3d(vec3(alongAxis.mul(1.6).sub(8.2), acrossAxis.mul(4.8).add(2.7), 3.73))
    const architecturalDomain = alongAxis.add(
      coarseNoise.mul(this.irregularityUniform).mul(0.028),
    )
    const architecturalCell = fract(architecturalDomain.mul(this.frequencyUniform))
    const architecturalLocalCoord = architecturalCell.mul(2).sub(1)
    const architecturalAbsCoord = abs(architecturalLocalCoord)
    const architecturalCurve = max(
      float(0),
      float(1).sub(architecturalLocalCoord.mul(architecturalLocalCoord)),
    )
    const architecturalProfile = pow(architecturalCurve, float(1.08))
      .mul(float(0.7))
      .mul(float(1).sub(architecturalAbsCoord.mul(this.irregularityUniform).mul(0.18)))
    const architecturalLensNormal = architecturalLocalCoord.mul(architecturalProfile)

    const bandIndex = floor(alongAxis.mul(this.frequencyUniform))
    const bandNoise = simplexNoise3d(vec3(bandIndex.mul(0.19), acrossAxis.mul(0.45), 5.11))
    const painterlyDomain = alongAxis
      .add(coarseNoise.mul(this.irregularityUniform).mul(0.055))
      .add(bandNoise.mul(this.irregularityUniform).mul(0.045))
      .add(warpNoise.mul(this.warpUniform).mul(0.02))
    const painterlyCell = fract(
      painterlyDomain.mul(this.frequencyUniform).add(
        bandNoise.mul(this.irregularityUniform).mul(0.85),
      ),
    )
    const painterlyLocalCoord = painterlyCell.mul(2).sub(1)
    const painterlyAbsCoord = abs(painterlyLocalCoord)
    const painterlyBody = max(
      float(0),
      float(1).sub(painterlyLocalCoord.mul(painterlyLocalCoord)),
    )
    const painterlyShoulder = smoothstep(float(0.08), float(0.52), painterlyAbsCoord).mul(
      float(1).sub(smoothstep(float(0.62), float(0.98), painterlyAbsCoord)),
    )
    const painterlyProfile = painterlyBody
      .mul(float(0.38))
      .add(painterlyShoulder.mul(float(0.84)))
      .mul(float(1).add(detailNoise.mul(this.warpUniform).mul(0.35)))
    const internalWarp = detailNoise
      .mul(this.warpUniform)
      .mul(painterlyBody)
      .mul(0.55)
      .add(warpNoise.mul(this.irregularityUniform).mul(painterlyShoulder).mul(0.24))
    const painterlyLensNormal = painterlyLocalCoord.mul(painterlyProfile).add(internalWarp)
    const lensNormal = select(
      isPainterlyPreset,
      painterlyLensNormal,
      architecturalLensNormal,
    )
    const perpX = sinA.negate()
    const perpY = cosA
    const presetStrength = select(isPainterlyPreset, float(2.7), float(1.7))
    const refractionStrength = this.amplitudeUniform.mul(presetStrength)
    const baseDisp = lensNormal.mul(refractionStrength).add(
      warpNoise.mul(this.warpUniform).mul(this.amplitudeUniform).mul(0.22),
    )
    const refractedUv = vec2(
      clamp(renderTargetUv.x.add(perpX.mul(baseDisp)), float(0), float(1)),
      clamp(renderTargetUv.y.add(perpY.mul(baseDisp)), float(0), float(1))
    )
    const sourceSample = this.trackSourceTextureNode(renderTargetUv)
    const refractedSample = this.trackSourceTextureNode(refractedUv)
    const sourceColor = vec3(
      float(sourceSample.r),
      float(sourceSample.g),
      float(sourceSample.b)
    )
    const refractedColor = vec3(
      float(refractedSample.r),
      float(refractedSample.g),
      float(refractedSample.b)
    )
    const sourceMix = select(
      isPainterlyPreset,
      float(0.08),
      float(0.14)
    )
    const baseColor = mix(
      refractedColor,
      sourceColor,
      sourceMix.mul(float(1).sub(this.amplitudeUniform.mul(8).clamp(float(0), float(0.85))))
    )
    const finalColor = clamp(
      baseColor,
      vec3(0, 0, 0),
      vec3(1, 1, 1)
    )

    return vec4(finalColor, float(1))
  }
}
