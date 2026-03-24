import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  attribute,
  clamp,
  float,
  positionLocal,
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
import { simplexNoise3d } from "@/renderer/shaders/tsl/noise/simplex-noise-3d"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export class ParticleGridPass extends PassNode {
  private readonly perspScene: THREE.Scene
  private readonly perspCamera: THREE.PerspectiveCamera
  private readonly internalRT: THREE.WebGLRenderTarget
  private readonly blitInputNode: Node

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

  private mesh: THREE.Mesh | null = null
  private meshMaterial: THREE.MeshBasicNodeMaterial | null = null
  private readonly bgColor = new THREE.Color(0x000000)
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

    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)

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

    if (this.inputSamplerNode) {
      this.inputSamplerNode.value = inputTexture
    }

    renderer.setClearColor(this.bgColor, 1)
    renderer.setRenderTarget(this.internalRT)
    renderer.render(this.perspScene, this.perspCamera)

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
        ? Math.max(16, Math.min(512, Math.round(params.gridResolution)))
        : 64
    const nextPointSize =
      typeof params.pointSize === "number" ? params.pointSize : 3
    const nextBloomEnabled = params.bloomEnabled === true

    if (nextResolution !== this.gridResolution || nextPointSize !== (this.pointSizeUniform.value as number)) {
      this.gridResolution = nextResolution
      this.pointSizeUniform.value = nextPointSize
      this.needsRebuild = true
    }

    this.displacementUniform.value =
      typeof params.displacement === "number" ? params.displacement : 0.5

    this.bgColor.set(typeof params.backgroundColor === "string" ? params.backgroundColor : "#000000")

    const noiseAmount = typeof params.noiseAmount === "number" ? params.noiseAmount : 0
    this.noiseAmountUniform.value = noiseAmount
    this.noiseScaleUniform.value =
      typeof params.noiseScale === "number" ? params.noiseScale : 3
    this.noiseSpeedUniform.value =
      typeof params.noiseSpeed === "number" ? params.noiseSpeed : 0.5
    this.isAnimated = noiseAmount > 0

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
    const pointSize = this.pointSizeUniform.value as number

    // Camera frustum at z=0
    const halfH = Math.tan((45 * Math.PI) / 360) * 1.2
    const halfW = halfH * aspect

    // Size of each quad in world units — convert point size from pixels to world
    // At z=0 with camera at 1.2, 1 world unit = canvas_height / (2 * halfH) pixels
    const pixelsPerUnit = this.height / (2 * halfH)
    const quadWorldSize = pointSize / pixelsPerUnit

    // Base quad: unit plane centered at origin
    const baseGeo = new THREE.PlaneGeometry(1, 1)

    // Instance attributes
    const offsets = new Float32Array(count * 3)
    const gridUvs = new Float32Array(count * 2)

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const i = row * res + col
        const u = col / (res - 1)
        const v = row / (res - 1)

        offsets[i * 3] = (u * 2 - 1) * halfW
        offsets[i * 3 + 1] = (v * 2 - 1) * halfH
        offsets[i * 3 + 2] = 0

        gridUvs[i * 2] = u
        gridUvs[i * 2 + 1] = 1 - v
      }
    }

    const instancedGeo = new THREE.InstancedBufferGeometry()
    instancedGeo.index = baseGeo.index
    instancedGeo.setAttribute("position", baseGeo.getAttribute("position")!)
    instancedGeo.setAttribute("normal", baseGeo.getAttribute("normal")!)
    instancedGeo.setAttribute("uv", baseGeo.getAttribute("uv")!)
    instancedGeo.setAttribute("instanceOffset", new THREE.InstancedBufferAttribute(offsets, 3))
    instancedGeo.setAttribute("instanceGridUv", new THREE.InstancedBufferAttribute(gridUvs, 2))
    instancedGeo.instanceCount = count

    // GPU material
    const instanceOffset = attribute("instanceOffset", "vec3")
    const instanceGridUv = attribute("instanceGridUv", "vec2")

    // Sample input texture per instance
    this.inputSamplerNode = tslTexture(this.placeholder, instanceGridUv)
    const sampledColor = this.inputSamplerNode

    // Luma for Z displacement
    const luma = sampledColor.r
      .mul(0.2126)
      .add(sampledColor.g.mul(0.7152))
      .add(sampledColor.b.mul(0.0722))

    // Per-particle noise using instance grid UV scaled by resolution
    const noiseUv = vec2(
      instanceGridUv.x.mul(float(res)).mul(this.noiseScaleUniform),
      instanceGridUv.y.mul(float(res)).mul(this.noiseScaleUniform),
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

    // Scale quad vertices by world size, then offset to instance position + noise + displacement
    const scaledPos = positionLocal.mul(float(quadWorldSize))
    const finalPos = vec3(
      scaledPos.x.add(instanceOffset.x).add(noiseOffsetX),
      scaledPos.y.add(instanceOffset.y).add(noiseOffsetY),
      scaledPos.z.add(instanceOffset.z).add(luma.mul(this.displacementUniform)),
    )

    // Circle mask using quad UV (0–1 per quad)
    // Edge width scales with point size so anti-aliasing is always ~1.5px
    const quadUv = uv()
    const dist = vec2(quadUv.x.sub(0.5), quadUv.y.sub(0.5)).length()
    const aaWidth = float(1.5).div(this.pointSizeUniform)
    const circleMask = smoothstep(float(0.5), float(0.5).sub(aaWidth), dist)

    const material = new THREE.MeshBasicNodeMaterial()
    material.positionNode = finalPos as Node
    material.colorNode = vec4(sampledColor.r, sampledColor.g, sampledColor.b, circleMask) as Node
    material.transparent = true
    material.alphaTest = 0.01
    material.depthWrite = false
    material.side = THREE.DoubleSide

    this.meshMaterial = material
    this.mesh = new THREE.Mesh(instancedGeo, material)
    this.mesh.frustumCulled = false
    this.perspScene.add(this.mesh)

    baseGeo.dispose()
  }

  private clearGrid(): void {
    if (this.mesh) {
      this.perspScene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }
    if (this.meshMaterial) {
      this.meshMaterial.dispose()
      this.meshMaterial = null
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
