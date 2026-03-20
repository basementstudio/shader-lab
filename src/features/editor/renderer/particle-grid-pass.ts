import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  attribute,
  clamp,
  float,
  positionLocal,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/features/editor/renderer/pass-node"
import { simplexNoise3d } from "@/features/editor/shaders/tsl/noise/simplex-noise-3d"
import type { LayerParameterValues } from "@/features/editor/types"

type Node = TSLNode

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class ParticleGridPass extends PassNode {
  private readonly perspScene: THREE.Scene
  private readonly perspCamera: THREE.PerspectiveCamera
  private readonly internalRT: THREE.WebGLRenderTarget
  private readonly blitInputNode: Node

  // GPU texture node — updated each frame with input texture
  private inputSamplerNode: Node | null = null
  private readonly displacementUniform: Node
  private readonly pointSizeUniform: Node
  private readonly timeUniform: Node
  private readonly noiseAmountUniform: Node
  private readonly noiseScaleUniform: Node
  private readonly noiseSpeedUniform: Node

  // Bloom
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  private points: THREE.Points | null = null
  private pointsMaterial: THREE.PointsNodeMaterial | null = null
  private gridResolution = 64
  private isAnimated = false
  private needsRebuild = true
  private width = 1
  private height = 1
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)

    this.perspScene = new THREE.Scene()
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.perspCamera.position.set(0, 0, 1.2)
    this.perspCamera.lookAt(0, 0, 0)

    this.placeholder = new THREE.Texture()

    this.internalRT = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    })

    this.displacementUniform = uniform(0.5)
    this.pointSizeUniform = uniform(3.0)
    this.timeUniform = uniform(0.0)
    this.noiseAmountUniform = uniform(0.0)
    this.noiseScaleUniform = uniform(3.0)
    this.noiseSpeedUniform = uniform(0.5)

    // Bloom uniforms
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)

    // Blit node for final output
    const blitUv = vec2(uv().x, float(1).sub(uv().y))
    this.blitInputNode = tslTexture(new THREE.Texture(), blitUv)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    if (this.needsRebuild) {
      this.rebuildGrid()
      this.needsRebuild = false
    }

    // Pass input texture to GPU sampler node
    if (this.inputSamplerNode) {
      this.inputSamplerNode.value = inputTexture
    }

    // Render points to internal RT
    renderer.setClearColor(0x000000, 1)
    renderer.setRenderTarget(this.internalRT)
    renderer.render(this.perspScene, this.perspCamera)

    // Blit to output
    this.blitInputNode.value = this.internalRT.texture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override beforeRender(time: number, _delta: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return this.isAnimated
  }

  override updateParams(params: LayerParameterValues): void {
    const nextResolution =
      typeof params.gridResolution === "number"
        ? Math.max(16, Math.min(256, Math.round(params.gridResolution)))
        : 64

    const nextBloomEnabled = params.bloomEnabled === true

    const nextPointSize =
      typeof params.pointSize === "number" ? params.pointSize : 3

    if (nextResolution !== this.gridResolution || nextPointSize !== (this.pointSizeUniform.value as number)) {
      this.gridResolution = nextResolution
      this.pointSizeUniform.value = nextPointSize
      this.needsRebuild = true
    }

    this.displacementUniform.value =
      typeof params.displacement === "number" ? params.displacement : 0.5

    // Noise
    const noiseAmount = typeof params.noiseAmount === "number" ? params.noiseAmount : 0
    this.noiseAmountUniform.value = noiseAmount
    this.noiseScaleUniform.value =
      typeof params.noiseScale === "number" ? params.noiseScale : 3
    this.noiseSpeedUniform.value =
      typeof params.noiseSpeed === "number" ? params.noiseSpeed : 0.5
    this.isAnimated = noiseAmount > 0

    // Bloom
    this.bloomIntensityUniform.value =
      typeof params.bloomIntensity === "number" ? Math.max(0, params.bloomIntensity) : 1.25
    this.bloomThresholdUniform.value =
      typeof params.bloomThreshold === "number" ? clamp01(params.bloomThreshold) : 0.6
    this.bloomRadiusUniform.value =
      typeof params.bloomRadius === "number" ? Math.max(0, params.bloomRadius) : 6
    this.bloomSoftnessUniform.value =
      typeof params.bloomSoftness === "number" ? clamp01(params.bloomSoftness) : 0.35

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = this.bloomIntensityUniform.value as number
      this.bloomNode.radius.value = this.normalizeBloomRadius(this.bloomRadiusUniform.value as number)
      this.bloomNode.threshold.value = this.bloomThresholdUniform.value as number
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(this.bloomSoftnessUniform.value as number)
    }
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.internalRT.setSize(this.width, this.height)
    this.perspCamera.aspect = this.width / this.height
    this.perspCamera.updateProjectionMatrix()
    // Rebuild grid to recompute frustum coverage
    this.needsRebuild = true
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.clearGrid()
    this.placeholder.dispose()
    this.internalRT.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.blitInputNode) {
      return this.inputNode
    }

    this.disposeBloomNode()
    this.bloomNode = null

    const baseColor = vec3(this.blitInputNode.r, this.blitInputNode.g, this.blitInputNode.b)

    if (!this.bloomEnabled) {
      return vec4(baseColor, float(1))
    }

    const bloomInput = vec4(baseColor, float(1))
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
        baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      ),
      float(1),
    )
  }

  private rebuildGrid(): void {
    this.clearGrid()

    const res = this.gridResolution
    const count = res * res
    const aspect = this.width / this.height

    // Fill camera frustum at z=0, camera at z=1.2, fov=45
    const halfH = Math.tan((45 * Math.PI) / 360) * 1.2
    const halfW = halfH * aspect

    const positions = new Float32Array(count * 3)
    const gridUvs = new Float32Array(count * 2)

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const i = row * res + col
        const u = col / (res - 1)
        const v = row / (res - 1)

        positions[i * 3] = (u * 2 - 1) * halfW
        positions[i * 3 + 1] = (v * 2 - 1) * halfH
        positions[i * 3 + 2] = 0

        gridUvs[i * 2] = u
        gridUvs[i * 2 + 1] = 1 - v
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("gridUv", new THREE.Float32BufferAttribute(gridUvs, 2))

    // GPU-driven material
    const gridUvAttr = attribute("gridUv", "vec2")

    this.inputSamplerNode = tslTexture(this.placeholder, gridUvAttr)
    const sampledColor = this.inputSamplerNode

    // Luma → Z displacement
    const luma = sampledColor.r
      .mul(0.2126)
      .add(sampledColor.g.mul(0.7152))
      .add(sampledColor.b.mul(0.0722))

    // Per-particle noise — scale UV by resolution so each particle gets its own noise value
    const noiseUv = vec2(
      gridUvAttr.x.mul(float(res)).mul(this.noiseScaleUniform),
      gridUvAttr.y.mul(float(res)).mul(this.noiseScaleUniform),
    )
    const noiseInputX = vec3(
      noiseUv.x,
      noiseUv.y,
      this.timeUniform.mul(this.noiseSpeedUniform),
    )
    const noiseInputY = vec3(
      noiseUv.x,
      noiseUv.y,
      this.timeUniform.mul(this.noiseSpeedUniform).add(float(100)),
    )
    const noiseOffsetX = simplexNoise3d(noiseInputX).mul(this.noiseAmountUniform).mul(0.01)
    const noiseOffsetY = simplexNoise3d(noiseInputY).mul(this.noiseAmountUniform).mul(0.01)

    const displacedPosition = vec3(
      positionLocal.x.add(noiseOffsetX),
      positionLocal.y.add(noiseOffsetY),
      positionLocal.z.add(luma.mul(this.displacementUniform)),
    )

    const material = new THREE.PointsNodeMaterial()
    material.positionNode = displacedPosition as Node
    material.colorNode = vec4(sampledColor.r, sampledColor.g, sampledColor.b, float(1)) as Node
    material.sizeNode = this.pointSizeUniform as Node
    material.sizeAttenuation = false

    this.pointsMaterial = material
    this.points = new THREE.Points(geometry, material)
    this.perspScene.add(this.points)
  }

  private clearGrid(): void {
    if (this.points) {
      this.perspScene.remove(this.points)
      this.points.geometry.dispose()
      this.points = null
    }
    if (this.pointsMaterial) {
      this.pointsMaterial.dispose()
      this.pointsMaterial = null
    }
    this.inputSamplerNode = null
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
