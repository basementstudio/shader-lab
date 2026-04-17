import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  float,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import { loadImageTexture } from "@/renderer/media-texture"
import { grainTexturePattern } from "@/renderer/shaders/tsl/patterns/grain-texture-pattern"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type InkColorMode = "gradient" | "source"

const INK_COLOR_MODE_GRADIENT = 0
const INK_COLOR_MODE_SOURCE = 1

const INTERNAL_TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  const color = new THREE.Color(`#${value}`)

  return [color.r, color.g, color.b]
}

function resolveInkColorMode(value: unknown): InkColorMode {
  return value === "source" ? "source" : "gradient"
}

function toInkColorModeValue(mode: InkColorMode): number {
  return mode === "source" ? INK_COLOR_MODE_SOURCE : INK_COLOR_MODE_GRADIENT
}

export class InkPass extends PassNode {
  private readonly blurScene: THREE.Scene
  private readonly compositeScene: THREE.Scene
  private readonly copyScene: THREE.Scene
  private readonly orthoCamera: THREE.OrthographicCamera
  private readonly blurMaterial: THREE.MeshBasicNodeMaterial
  private readonly compositeMaterial: THREE.MeshBasicNodeMaterial
  private readonly copyMaterial: THREE.MeshBasicNodeMaterial
  private readonly blurInputNode: Node
  private readonly crispInputNode: Node
  private readonly finalInputNode: Node
  private readonly copyInputNode: Node
  private readonly noiseInputNode: Node

  private blurSampleNodes: Node[] = []
  private compositeBlurNodes: Node[] = []
  private noiseSampleNodes: Node[] = []

  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  private readonly backgroundColorUniform: Node
  private readonly coreColorUniform: Node
  private readonly edgeColorUniform: Node
  private readonly midColorUniform: Node

  private readonly blurStrengthUniform: Node
  private readonly crispBlendUniform: Node
  private readonly directionXUniform: Node
  private readonly directionYUniform: Node
  private readonly dripLengthUniform: Node
  private readonly dripWeightUniform: Node
  private readonly fluidNoiseUniform: Node
  private readonly grainEnabledUniform: Node
  private readonly grainIntensityUniform: Node
  private readonly grainScaleUniform: Node
  private readonly blurSpreadUniform: Node
  private readonly noiseScaleUniform: Node
  private readonly passIndexUniform: Node
  private readonly resolutionWidthUniform: Node
  private readonly resolutionHeightUniform: Node
  private readonly smokeSpeedUniform: Node
  private readonly smokeTurbulenceUniform: Node
  private readonly timeUniform: Node
  private readonly colorModeUniform: Node

  private blurPassCount = 12
  private crispPassCount = 3
  private compositeTarget: THREE.WebGLRenderTarget
  private crispTarget: THREE.WebGLRenderTarget
  private readTarget: THREE.WebGLRenderTarget
  private writeTarget: THREE.WebGLRenderTarget
  private readonly placeholder: THREE.Texture
  private noiseTexture: THREE.Texture | null = null
  private noiseLoadStarted = false
  private needsRefresh = true
  private width = 1
  private height = 1
  private isAnimated = true

  constructor(layerId: string) {
    super(layerId)

    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.blurScene = new THREE.Scene()
    this.compositeScene = new THREE.Scene()
    this.copyScene = new THREE.Scene()

    this.placeholder = new THREE.Texture()
    const flippedUv = vec2(uv().x, float(1).sub(uv().y))
    this.blurInputNode = tslTexture(this.placeholder, flippedUv)
    this.crispInputNode = tslTexture(this.placeholder, flippedUv)
    this.finalInputNode = tslTexture(this.placeholder, flippedUv)
    this.copyInputNode = tslTexture(this.placeholder, flippedUv)
    this.noiseInputNode = tslTexture(this.placeholder, flippedUv)

    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)

    this.backgroundColorUniform = uniform(new THREE.Vector3(0.039, 0.043, 0.051))
    this.coreColorUniform = uniform(new THREE.Vector3(1.0, 0.992, 0.91))
    this.midColorUniform = uniform(new THREE.Vector3(0.784, 0.961, 0.259))
    this.edgeColorUniform = uniform(new THREE.Vector3(0.0, 0.788, 0.655))

    this.blurStrengthUniform = uniform(0.02)
    this.crispBlendUniform = uniform(0.75)
    this.directionXUniform = uniform(0.3746)
    this.directionYUniform = uniform(0.9271)
    this.dripLengthUniform = uniform(7.1)
    this.dripWeightUniform = uniform(1.2)
    this.fluidNoiseUniform = uniform(0.2)
    this.grainEnabledUniform = uniform(1)
    this.grainIntensityUniform = uniform(0.3)
    this.grainScaleUniform = uniform(1.5)
    this.blurSpreadUniform = uniform(1.7)
    this.noiseScaleUniform = uniform(1)
    this.passIndexUniform = uniform(0)
    this.resolutionWidthUniform = uniform(1)
    this.resolutionHeightUniform = uniform(1)
    this.smokeSpeedUniform = uniform(0.2)
    this.smokeTurbulenceUniform = uniform(0.25)
    this.timeUniform = uniform(0)
    this.colorModeUniform = uniform(INK_COLOR_MODE_GRADIENT)

    this.readTarget = new THREE.WebGLRenderTarget(1, 1, INTERNAL_TARGET_OPTIONS)
    this.writeTarget = new THREE.WebGLRenderTarget(1, 1, INTERNAL_TARGET_OPTIONS)
    this.crispTarget = new THREE.WebGLRenderTarget(1, 1, INTERNAL_TARGET_OPTIONS)
    this.compositeTarget = new THREE.WebGLRenderTarget(1, 1, INTERNAL_TARGET_OPTIONS)

    this.blurMaterial = new THREE.MeshBasicNodeMaterial()
    this.blurMaterial.colorNode = this.buildBlurNode()
    const blurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMaterial)
    blurMesh.frustumCulled = false
    this.blurScene.add(blurMesh)

    this.copyMaterial = new THREE.MeshBasicNodeMaterial()
    this.copyMaterial.colorNode = vec4(this.copyInputNode.rgb, float(1))
    const copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial)
    copyMesh.frustumCulled = false
    this.copyScene.add(copyMesh)

    this.compositeMaterial = new THREE.MeshBasicNodeMaterial()
    this.compositeMaterial.colorNode = this.buildCompositeNode()
    const compositeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.compositeMaterial,
    )
    compositeMesh.frustumCulled = false
    this.compositeScene.add(compositeMesh)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    this.ensureNoiseTexture()

    this.blurInputNode.value = inputTexture
    this.noiseInputNode.value = this.noiseTexture ?? this.placeholder
    for (const node of this.blurSampleNodes) {
      node.value = inputTexture
    }
    for (const node of this.noiseSampleNodes) {
      node.value = this.noiseTexture ?? this.placeholder
    }
    this.passIndexUniform.value = 0

    renderer.setRenderTarget(this.readTarget)
    renderer.render(this.blurScene, this.orthoCamera)

    if (this.crispPassCount <= 1) {
      this.copyInputNode.value = this.readTarget.texture
      renderer.setRenderTarget(this.crispTarget)
      renderer.render(this.copyScene, this.orthoCamera)
    }

    const totalPasses = Math.max(this.blurPassCount, this.crispPassCount)
    let readTarget = this.readTarget
    let writeTarget = this.writeTarget

    for (let passIndex = 1; passIndex < totalPasses; passIndex += 1) {
      this.blurInputNode.value = readTarget.texture
      for (const node of this.blurSampleNodes) {
        node.value = readTarget.texture
      }
      this.passIndexUniform.value = passIndex
      renderer.setRenderTarget(writeTarget)
      renderer.render(this.blurScene, this.orthoCamera)

      if (passIndex === this.crispPassCount - 1) {
        this.copyInputNode.value = writeTarget.texture
        renderer.setRenderTarget(this.crispTarget)
        renderer.render(this.copyScene, this.orthoCamera)
      }

      const temp = readTarget
      readTarget = writeTarget
      writeTarget = temp
    }

    this.finalInputNode.value = readTarget.texture
    this.crispInputNode.value = this.crispTarget.texture
    for (const node of this.compositeBlurNodes) {
      node.value = readTarget.texture
    }
    renderer.setRenderTarget(this.compositeTarget)
    renderer.render(this.compositeScene, this.orthoCamera)

    this.finalInputNode.value = this.compositeTarget.texture
    super.render(renderer, inputTexture, outputTarget, time, delta)
    this.needsRefresh = false
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return this.isAnimated || this.needsRefresh
  }

  override updateParams(params: LayerParameterValues): void {
    const angle = (((typeof params.blurDirection === "number" ? params.blurDirection : 68) *
      Math.PI) /
      180)

    this.directionXUniform.value = Math.cos(angle)
    this.directionYUniform.value = Math.sin(angle)
    this.blurPassCount =
      typeof params.blurPasses === "number" ? Math.max(1, Math.round(params.blurPasses)) : 12
    this.crispPassCount =
      typeof params.crispPasses === "number" ? Math.max(1, Math.round(params.crispPasses)) : 3
    this.blurStrengthUniform.value =
      typeof params.blurStrength === "number" ? Math.max(0.001, params.blurStrength) : 0.02
    this.crispBlendUniform.value =
      typeof params.crispBlend === "number" ? clamp01(params.crispBlend) : 0.75
    this.dripLengthUniform.value =
      typeof params.dripLength === "number" ? Math.max(1, params.dripLength) : 7.1
    this.dripWeightUniform.value =
      typeof params.dripWeight === "number" ? Math.max(0.2, params.dripWeight) : 1.2
    this.fluidNoiseUniform.value =
      typeof params.fluidNoise === "number" ? Math.max(0, params.fluidNoise) : 0.2
    this.noiseScaleUniform.value =
      typeof params.noiseScale === "number" ? Math.max(0.5, params.noiseScale) : 1
    this.smokeSpeedUniform.value =
      typeof params.smokeSpeed === "number" ? Math.max(0, params.smokeSpeed) : 0.2
    this.smokeTurbulenceUniform.value =
      typeof params.smokeTurbulence === "number" ? Math.max(0, params.smokeTurbulence) : 0.25
    this.blurSpreadUniform.value =
      typeof params.blurSpread === "number" ? Math.max(0.5, params.blurSpread) : 1.7
    this.grainEnabledUniform.value = params.grainEnabled === false ? 0 : 1
    this.grainIntensityUniform.value =
      typeof params.grainIntensity === "number" ? clamp01(params.grainIntensity) : 0.3
    this.grainScaleUniform.value =
      typeof params.grainScale === "number" ? Math.max(0.5, params.grainScale) : 1.5
    this.colorModeUniform.value = toInkColorModeValue(resolveInkColorMode(params.colorMode))

    this.setColorUniform(
      this.backgroundColorUniform,
      typeof params.backgroundColor === "string" ? params.backgroundColor : "#0a0b0d",
    )
    this.setColorUniform(
      this.coreColorUniform,
      typeof params.coreColor === "string" ? params.coreColor : "#fffde8",
    )
    this.setColorUniform(
      this.midColorUniform,
      typeof params.midColor === "string" ? params.midColor : "#c8f542",
    )
    this.setColorUniform(
      this.edgeColorUniform,
      typeof params.edgeColor === "string" ? params.edgeColor : "#00c9a7",
    )

    const nextBloomEnabled = params.bloomEnabled === true
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number" ? Math.max(0, params.bloomIntensity) : 1.25
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number" ? clamp01(params.bloomThreshold) : 0.6
    const nextBloomRadius =
      typeof params.bloomRadius === "number" ? Math.max(0, params.bloomRadius) : 6
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number" ? clamp01(params.bloomSoftness) : 0.35

    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
    } else if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(nextBloomSoftness)
    }

    this.isAnimated = (this.smokeSpeedUniform.value as number) > 0
    this.needsRefresh = true
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.resolutionWidthUniform.value = this.width
    this.resolutionHeightUniform.value = this.height
    this.readTarget.setSize(this.width, this.height)
    this.writeTarget.setSize(this.width, this.height)
    this.crispTarget.setSize(this.width, this.height)
    this.compositeTarget.setSize(this.width, this.height)
    this.needsRefresh = true
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.noiseTexture?.dispose()
    this.readTarget?.dispose()
    this.writeTarget?.dispose()
    this.crispTarget?.dispose()
    this.compositeTarget?.dispose()
    this.blurMaterial?.dispose()
    this.copyMaterial?.dispose()
    this.compositeMaterial?.dispose()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.finalInputNode) {
      return vec4(float(0), float(0), float(0), float(1))
    }

    this.disposeBloomNode()
    this.bloomNode = null

    const baseColor = vec3(this.finalInputNode.r, this.finalInputNode.g, this.finalInputNode.b)

    if (!this.bloomEnabled) {
      return vec4(baseColor, float(1))
    }

    this.bloomNode = bloom(
      vec4(baseColor, float(1)),
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

  private buildBlurNode(): Node {
    this.blurSampleNodes = []
    this.noiseSampleNodes = []

    const texUv = vec2(uv().x, float(1).sub(uv().y))
    const texelSize = vec2(
      float(1).div(this.resolutionWidthUniform),
      float(1).div(this.resolutionHeightUniform),
    )
    const original = this.blurInputNode
    const originalIntensity = max(max(original.r, original.g), original.b)
    const rotatedUv = vec2(
      texUv.x.mul(float(Math.cos(0.7854))).sub(texUv.y.mul(float(Math.sin(0.7854)))),
      texUv.x.mul(float(Math.sin(0.7854))).add(texUv.y.mul(float(Math.cos(0.7854)))),
    )
    const timeOffset1 = vec2(
      this.timeUniform.mul(this.smokeSpeedUniform).mul(0.3),
      this.timeUniform.mul(this.smokeSpeedUniform).mul(0.15),
    )
    const timeOffset2 = vec2(
      sin(this.timeUniform.mul(this.smokeSpeedUniform).mul(0.7)).mul(0.1),
      sin(this.timeUniform.mul(this.smokeSpeedUniform).mul(0.5).add(float(1.5707963))).mul(0.08),
    )
    const noiseUv1 = texUv
      .mul(this.noiseScaleUniform)
      .add(vec2(this.passIndexUniform.mul(0.1), this.passIndexUniform.mul(0.1)))
      .add(timeOffset1)
    const noiseUv2 = rotatedUv
      .mul(this.noiseScaleUniform)
      .mul(0.8)
      .add(vec2(this.passIndexUniform.mul(0.15), this.passIndexUniform.mul(0.15)))
      .add(timeOffset1.mul(1.2))
    const turbulenceUv = rotatedUv
      .mul(this.noiseScaleUniform)
      .mul(0.6)
      .add(timeOffset2.mul(2))

    const noiseSample1 = this.trackNoiseSampleNode(noiseUv1)
    const noiseSample2 = this.trackNoiseSampleNode(noiseUv2)
    const turbulenceSample = this.trackNoiseSampleNode(turbulenceUv)
    const noiseSample = mix(noiseSample1.rgb, noiseSample2.rgb, float(0.5))

    const noiseX = noiseSample.r
      .sub(0.5)
      .mul(2)
      .mul(this.fluidNoiseUniform)
      .add(turbulenceSample.r.sub(0.5).mul(this.smokeTurbulenceUniform))
    const noiseY = noiseSample.g
      .sub(0.5)
      .mul(2)
      .mul(this.fluidNoiseUniform)
      .mul(0.4)
      .add(turbulenceSample.g.sub(0.5).mul(this.smokeTurbulenceUniform).mul(0.5))

    const flowDir = vec2(
      this.directionXUniform.add(noiseX),
      this.directionYUniform.add(noiseY),
    ).normalize()
    const baseNoise = noiseSample.b.sub(0.5).mul(0.03).mul(this.fluidNoiseUniform)

    let result: Node = vec4(float(0), float(0), float(0), float(0))
    let totalWeight: Node = float(0)

    for (let sampleIndex = 0; sampleIndex < 10; sampleIndex += 1) {
      const t = float(sampleIndex / 9)
      const asymmetry = smoothstep(float(0), float(1), t).mul(t).add(t.mul(0.5))
      const sampleDist = asymmetry
        .mul(this.dripLengthUniform)
        .mul(this.blurStrengthUniform)
        .mul(float(1).add(this.passIndexUniform.mul(this.blurSpreadUniform).mul(0.15)))
      const sampleNoise = baseNoise.mul(float(1 + sampleIndex * 0.1))
      const disperseTurbulence = sampleNoise.mul(t).mul(this.smokeTurbulenceUniform)
      const samplePos = texUv
        .add(flowDir.mul(sampleDist).mul(texelSize).mul(100))
        .add(
          vec2(
            sampleNoise.add(disperseTurbulence),
            sampleNoise.add(disperseTurbulence).mul(0.3),
          ),
        )
      const weight = mix(float(1).sub(t), float(1), smoothstep(float(0.35), float(0), t))
      const sample = this.trackBlurSampleNode(samplePos)
      result = result.add(sample.mul(weight))
      totalWeight = totalWeight.add(weight)
    }

    for (let sampleIndex = 1; sampleIndex <= 2; sampleIndex += 1) {
      const t = float(sampleIndex / 3)
      const sampleDist = t
        .mul(this.dripLengthUniform)
        .mul(this.blurStrengthUniform)
        .mul(0.2)
      const samplePos = texUv.sub(flowDir.mul(sampleDist).mul(texelSize).mul(100))
      const weight = float(1).sub(t).mul(0.4)
      const sample = this.trackBlurSampleNode(samplePos)
      result = result.add(sample.mul(weight))
      totalWeight = totalWeight.add(weight)
    }

    const blurred = result.div(max(totalWeight, float(0.0001)))
    const lifted = max(blurred, original)
    return vec4(mix(blurred.rgb, lifted.rgb, originalIntensity.mul(0.5)), float(1))
  }

  private buildCompositeNode(): Node {
    this.compositeBlurNodes = []

    const texUv = vec2(uv().x, float(1).sub(uv().y))
    const blurSample = this.finalInputNode
    const crispSample = this.crispInputNode
    const blurIntensity = max(max(blurSample.r, blurSample.g), blurSample.b)
    const crispIntensity = max(max(crispSample.r, crispSample.g), crispSample.b)
    const texelSize = vec2(
      float(1).div(this.resolutionWidthUniform),
      float(1).div(this.resolutionHeightUniform),
    )
    const blurR = this.trackCompositeBlurNode(
      texUv.add(vec2(texelSize.x.mul(2), texelSize.y)),
    ).r
    const blurB = this.trackCompositeBlurNode(
      texUv.sub(vec2(texelSize.x.mul(2), texelSize.y)),
    ).b

    const backgroundColor = vec3(
      float(this.backgroundColorUniform.x),
      float(this.backgroundColorUniform.y),
      float(this.backgroundColorUniform.z),
    )
    const edgeColor = vec3(
      float(this.edgeColorUniform.x),
      float(this.edgeColorUniform.y),
      float(this.edgeColorUniform.z),
    )
    const midColor = vec3(
      float(this.midColorUniform.x),
      float(this.midColorUniform.y),
      float(this.midColorUniform.z),
    )
    const coreColor = vec3(
      float(this.coreColorUniform.x),
      float(this.coreColorUniform.y),
      float(this.coreColorUniform.z),
    )

    const fluidGradientColor = this.applyColorGradient(
      blurIntensity,
      backgroundColor,
      edgeColor,
      midColor,
      coreColor,
    )
    const crispGradientColor = this.applyColorGradient(
      crispIntensity,
      backgroundColor,
      edgeColor,
      midColor,
      coreColor,
    )
    const fluidSourceColor = vec3(
      mix(blurSample.r, blurSample.r.mul(1.1), blurR.mul(0.3)),
      blurSample.g,
      mix(blurSample.b, blurSample.b.mul(1.15), blurB.mul(0.3)),
    )
    const useSourceColor = this.colorModeUniform.greaterThan(float(0.5))
    const fluidColor = select(useSourceColor, fluidSourceColor, fluidGradientColor)
    const crispColor = select(useSourceColor, crispSample.rgb, crispGradientColor)

    const fluidMask = pow(clamp(blurIntensity, float(0), float(1)), float(1.2))
    const crispMask = pow(clamp(crispIntensity, float(0), float(1)), float(0.96))
    const fluidGlow = fluidColor.mul(fluidMask).mul(1.8)
    const crispGlow = crispColor.mul(crispMask).mul(1.95)
    const crispWeight = crispMask.mul(this.crispBlendUniform)
    let combined = mix(fluidGlow, crispGlow, crispWeight).add(fluidGlow.mul(0.15))

    const grain = grainTexturePattern(
      texUv.mul(vec2(this.grainScaleUniform, this.grainScaleUniform)),
    )
      .sub(0.5)
      .mul(this.grainIntensityUniform)
    combined = select(
      this.grainEnabledUniform.greaterThan(float(0.5)),
      combined.add(vec3(grain, grain, grain)),
      combined,
    )

    const alpha = max(fluidMask, crispMask)
    let finalColor = mix(backgroundColor, combined, smoothstep(float(0.01), float(0.85), alpha))
    const vignetteUv = texUv.mul(2).sub(vec2(1, 1))
    finalColor = finalColor.mul(float(1).sub(vignetteUv.dot(vignetteUv).mul(0.15)))

    return vec4(clamp(finalColor, vec3(0, 0, 0), vec3(1, 1, 1)), float(1))
  }

  private applyColorGradient(
    intensity: Node,
    bgColor: Node,
    edgeColor: Node,
    midColor: Node,
    coreColor: Node,
  ): Node {
    const t1 = smoothstep(float(0.6), float(0.95), intensity)
    const t2 = smoothstep(float(0.2), float(0.65), intensity)
    const t3 = smoothstep(float(0), float(0.25), intensity)
    const edgeMixed = mix(bgColor, edgeColor, t3)
    const midMixed = mix(edgeMixed, midColor, t2)
    return mix(midMixed, coreColor, t1)
  }

  private ensureNoiseTexture(): void {
    if (this.noiseTexture || this.noiseLoadStarted) {
      return
    }

    this.noiseLoadStarted = true
    void loadImageTexture("/textures/blue-noise.png")
      .then((texture) => {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        this.noiseTexture = texture
        this.needsRefresh = true
      })
      .catch(() => {
        this.needsRefresh = true
      })
  }

  private trackBlurSampleNode(sampleUv: Node): Node {
    const sampleNode = tslTexture(this.placeholder, sampleUv)
    this.blurSampleNodes.push(sampleNode)
    return sampleNode
  }

  private trackCompositeBlurNode(sampleUv: Node): Node {
    const sampleNode = tslTexture(this.placeholder, sampleUv)
    this.compositeBlurNodes.push(sampleNode)
    return sampleNode
  }

  private trackNoiseSampleNode(sampleUv: Node): Node {
    const sampleNode = tslTexture(this.placeholder, sampleUv)
    this.noiseSampleNodes.push(sampleNode)
    return sampleNode
  }

  private setColorUniform(target: Node, value: string): void {
    const [r, g, b] = hexToRgb(value)
    ;(target.value as THREE.Vector3).set(r, g, b)
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
