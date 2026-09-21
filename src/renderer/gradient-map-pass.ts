import {
  clamp,
  dot,
  float,
  mix,
  pow,
  select,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  buildLinearColorMap,
  COLOR_MAP_LUT_SIZE,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

export class GradientMapPass extends PassNode {
  private readonly amountUniform: Node
  private readonly invertUniform: Node
  private readonly lut: THREE.DataTexture
  private readonly sourceNode: Node
  private readonly sourcePlaceholder = new THREE.Texture()
  private stopsKey = ""

  constructor(layerId: string) {
    super(layerId)
    this.amountUniform = uniform(1)
    this.invertUniform = uniform(0)
    this.lut = new THREE.DataTexture(
      new Float32Array(COLOR_MAP_LUT_SIZE * 4),
      COLOR_MAP_LUT_SIZE,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.lut.magFilter = THREE.LinearFilter
    this.lut.minFilter = THREE.LinearFilter
    this.lut.generateMipmaps = false
    this.sourceNode = texture(
      this.sourcePlaceholder,
      vec2(uv().x, float(1).sub(uv().y))
    )
    this.updateParams({})
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.sourceNode.value = this.resolveEffectSource(inputTexture)
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.updateSourceMode(params)
    this.amountUniform.value =
      typeof params.amount === "number"
        ? Math.max(0, Math.min(1, params.amount))
        : 1
    this.invertUniform.value = params.invert === true ? 1 : 0
    const stops = parseGradientMapStops(params.stops)
    const key = serializeGradientMapStops(stops)
    if (key !== this.stopsKey) {
      this.stopsKey = key
      ;(this.lut.image.data as Float32Array).set(buildLinearColorMap(stops))
      this.lut.needsUpdate = true
    }
  }

  protected override buildEffectNode(): Node {
    if (!this.lut) {
      return this.inputNode
    }
    const source = vec3(
      float(this.sourceNode.r),
      float(this.sourceNode.g),
      float(this.sourceNode.b)
    )
    const luma = clamp(dot(source, vec3(0.2126, 0.7152, 0.0722)), 0, 1)
    const perceptual = select(
      luma.lessThanEqual(float(0.0031308)),
      luma.mul(12.92),
      pow(luma, float(1 / 2.4)).mul(1.055).sub(0.055)
    )
    const tone = select(
      this.invertUniform.greaterThan(float(0.5)),
      float(1).sub(perceptual),
      perceptual
    )
    const mapped = texture(this.lut, vec2(tone, float(0.5))).level(0)
    return vec4(
      mix(source, vec3(mapped.r, mapped.g, mapped.b), this.amountUniform),
      float(1)
    )
  }

  override dispose(): void {
    this.lut.dispose()
    this.sourcePlaceholder.dispose()
    super.dispose()
  }
}
