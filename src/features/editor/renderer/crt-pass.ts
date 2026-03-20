import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  dot,
  float,
  floor,
  mix,
  mod,
  select,
  sin,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { simplexNoise3d } from "@/features/editor/shaders/tsl/noise/simplex-noise-3d"
import { PassNode } from "@/features/editor/renderer/pass-node"
import type { LayerParameterValues } from "@/features/editor/types"

type Node = TSLNode

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class CrtPass extends PassNode {
  private bloomEnabled = true
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  private readonly cellSizeUniform: Node
  private readonly scanlineIntensityUniform: Node
  private readonly maskIntensityUniform: Node
  private readonly barrelDistortionUniform: Node
  private readonly chromaticAberrationUniform: Node
  private readonly vignetteIntensityUniform: Node
  private readonly flickerIntensityUniform: Node
  private readonly staticIntensityUniform: Node
  private readonly glitchIntensityUniform: Node
  private readonly glitchSpeedUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node
  private readonly timeUniform: Node

  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()

    this.cellSizeUniform = uniform(3)
    this.scanlineIntensityUniform = uniform(0.17)
    this.maskIntensityUniform = uniform(1)
    this.barrelDistortionUniform = uniform(0.15)
    this.chromaticAberrationUniform = uniform(2)
    this.vignetteIntensityUniform = uniform(0.45)
    this.flickerIntensityUniform = uniform(0.2)
    this.staticIntensityUniform = uniform(0.01)
    this.glitchIntensityUniform = uniform(0.13)
    this.glitchSpeedUniform = uniform(5)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.timeUniform = uniform(0)

    this.bloomIntensityUniform = uniform(1.93)
    this.bloomRadiusUniform = uniform(8)
    this.bloomSoftnessUniform = uniform(0.31)
    this.bloomThresholdUniform = uniform(0)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override beforeRender(time: number, _delta: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return (
      (this.flickerIntensityUniform.value as number) > 0 ||
      (this.staticIntensityUniform.value as number) > 0 ||
      (this.glitchIntensityUniform.value as number) > 0
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.cellSizeUniform.value =
      typeof params.cellSize === "number" ? Math.max(2, Math.round(params.cellSize)) : 4
    this.scanlineIntensityUniform.value =
      typeof params.scanlineIntensity === "number" ? clamp01(params.scanlineIntensity) : 0.3
    this.maskIntensityUniform.value =
      typeof params.maskIntensity === "number" ? clamp01(params.maskIntensity) : 0.7
    this.barrelDistortionUniform.value =
      typeof params.barrelDistortion === "number"
        ? Math.max(0, Math.min(0.3, params.barrelDistortion))
        : 0.02
    this.chromaticAberrationUniform.value =
      typeof params.chromaticAberration === "number"
        ? Math.max(0, Math.min(2, params.chromaticAberration))
        : 0.3
    this.vignetteIntensityUniform.value =
      typeof params.vignetteIntensity === "number" ? clamp01(params.vignetteIntensity) : 0.3
    this.flickerIntensityUniform.value =
      typeof params.flickerIntensity === "number"
        ? Math.max(0, Math.min(0.2, params.flickerIntensity))
        : 0.03
    this.staticIntensityUniform.value =
      typeof params.staticIntensity === "number"
        ? Math.max(0, Math.min(0.5, params.staticIntensity))
        : 0.05
    this.glitchIntensityUniform.value =
      typeof params.glitchIntensity === "number" ? clamp01(params.glitchIntensity) : 0
    this.glitchSpeedUniform.value =
      typeof params.glitchSpeed === "number"
        ? Math.max(0.1, Math.min(5, params.glitchSpeed))
        : 1

    const nextBloomEnabled = params.bloomEnabled !== false
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number" ? Math.max(0, params.bloomIntensity) : 1.5
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number" ? clamp01(params.bloomThreshold) : 0.4
    const nextBloomRadius =
      typeof params.bloomRadius === "number" ? Math.max(0, params.bloomRadius) : 8
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number" ? clamp01(params.bloomSoftness) : 0.4

    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
      return
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(nextBloomSoftness)
    }
  }

  override resize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.cellSizeUniform || !this.placeholder) {
      return this.inputNode
    }

    this.disposeBloomNode()
    this.bloomNode = null
    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const dims = vec2(this.widthUniform, this.heightUniform)

    // 1. Barrel distortion
    const centered = renderTargetUv.sub(vec2(0.5, 0.5))
    const distSq = dot(centered, centered)
    const distortedUv = renderTargetUv.add(centered.mul(distSq).mul(this.barrelDistortionUniform))

    // 2. Scan jitter (glitch)
    const glitchNoiseCoord = vec3(
      float(0),
      floor(distortedUv.y.mul(this.heightUniform).div(float(8))),
      this.timeUniform.mul(this.glitchSpeedUniform),
    )
    const glitchNoise = simplexNoise3d(glitchNoiseCoord)
    const glitchThreshold = float(1).sub(this.glitchIntensityUniform.mul(float(0.5)))
    const glitchOffset = select(
      glitchNoise.greaterThan(glitchThreshold),
      glitchNoise.mul(this.glitchIntensityUniform).mul(float(0.02)),
      float(0),
    )
    const glitchedUv = vec2(distortedUv.x.add(glitchOffset), distortedUv.y)

    // 3. Pixelation
    const cellCoord = floor(glitchedUv.mul(dims).div(this.cellSizeUniform))
    const snappedUv = cellCoord.add(vec2(0.5, 0.5)).mul(this.cellSizeUniform).div(dims)

    // 4. Chromatic aberration
    const dirFromCenter = snappedUv.sub(vec2(0.5, 0.5)).mul(this.chromaticAberrationUniform).div(dims)
    const rSample = this.trackSourceTextureNode(snappedUv.sub(dirFromCenter))
    const gSample = this.trackSourceTextureNode(snappedUv)
    const bSample = this.trackSourceTextureNode(snappedUv.add(dirFromCenter))
    let color = vec3(float(rSample.r), float(gSample.g), float(bSample.b))

    // 5. RGB shadow mask
    const subPixel = mod(floor(glitchedUv.x.mul(this.widthUniform).div(this.cellSizeUniform)), float(3))
    const maskDim = float(1).sub(this.maskIntensityUniform)
    const maskR = select(subPixel.lessThan(float(0.5)), float(1), maskDim)
    const maskG = select(
      subPixel.greaterThan(float(0.5)).and(subPixel.lessThan(float(1.5))),
      float(1),
      maskDim,
    )
    const maskB = select(subPixel.greaterThan(float(1.5)), float(1), maskDim)
    color = color.mul(vec3(maskR, maskG, maskB))

    // 6. Scanlines
    const scanline = sin(glitchedUv.y.mul(this.heightUniform).div(this.cellSizeUniform).mul(float(Math.PI)))
      .mul(float(0.5))
      .add(float(0.5))
    color = color.mul(mix(float(1), scanline, this.scanlineIntensityUniform))

    // 7. Vignette
    const vigDist = centered.length().mul(float(2))
    const vignette = clamp(float(1).sub(vigDist.mul(vigDist).mul(this.vignetteIntensityUniform)), float(0), float(1))
    color = color.mul(vignette)

    // 8. Flicker
    const flickerNoise = simplexNoise3d(vec3(float(0), float(0), this.timeUniform.mul(float(8))))
    const flicker = float(1).add(flickerNoise.mul(this.flickerIntensityUniform))
    color = color.mul(flicker)

    // 9. Static
    const staticNoise = simplexNoise3d(
      vec3(renderTargetUv.mul(dims), this.timeUniform.mul(float(60))),
    )
    color = color.add(staticNoise.sub(float(0.5)).mul(this.staticIntensityUniform))

    // Clamp final color
    color = clamp(color, vec3(float(0), float(0), float(0)), vec3(float(1), float(1), float(1)))

    if (!this.bloomEnabled) {
      return vec4(color, float(1))
    }

    // 9. Bloom
    const bloomInput = vec4(color, float(1))
    this.bloomNode = bloom(
      bloomInput,
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number,
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number,
    )

    return vec4(
      clamp(
        color.add(this.getBloomTextureNode().rgb),
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

  private trackSourceTextureNode(uvNode: Node): Node {
    const sourceTextureNode = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(sourceTextureNode)
    return sourceTextureNode
  }
}
