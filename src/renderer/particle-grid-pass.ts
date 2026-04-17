import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  Fn,
  float,
  floor,
  instanceIndex,
  positionLocal,
  smoothstep,
  type TSLNode,
  textureStore,
  texture as tslTexture,
  uniform,
  uv,
  uvec2,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import { simplexNoise3d } from "@/renderer/shaders/tsl/noise/simplex-noise-3d"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
const PARTICLE_GRID_RESOLUTIONS = [
  32, 64, 128, 256, 512, 1024, 2048, 4096,
] as const
const NOISE_TEX_SIZE = 512

function resolveGridResolution(value: unknown): number {
  let requested = Number.NaN

  if (typeof value === "number") {
    requested = value
  } else if (typeof value === "string") {
    requested = Number.parseInt(value, 10)
  }

  if (!Number.isFinite(requested)) {
    return 64
  }

  let nearest: number = PARTICLE_GRID_RESOLUTIONS[0]
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const candidate of PARTICLE_GRID_RESOLUTIONS) {
    const distance = Math.abs(candidate - requested)

    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  return nearest
}

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
  private readonly resolutionUniform: Node
  private readonly halfWUniform: Node
  private readonly halfHUniform: Node
  private readonly quadSizeUniform: Node

  // Bloom
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  // Noise compute
  private readonly noiseTexture: THREE.StorageTexture
  private noiseComputeNode: unknown = null

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

    const halfH = Math.tan((45 * Math.PI) / 360) * 1.2
    this.resolutionUniform = uniform(64)
    this.halfHUniform = uniform(halfH)
    this.halfWUniform = uniform(halfH)
    this.quadSizeUniform = uniform(1.0)

    this.noiseTexture = new THREE.StorageTexture(NOISE_TEX_SIZE, NOISE_TEX_SIZE)
    this.noiseComputeNode = this.buildNoiseCompute()

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
    delta: number
  ): void {
    if (this.needsRebuild) {
      this.rebuildGrid()
      this.needsRebuild = false
    }

    if (this.inputSamplerNode) {
      this.inputSamplerNode.value = inputTexture
    }

    if (this.isAnimated) {
      renderer.compute(this.noiseComputeNode)
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
    const nextResolution = resolveGridResolution(params.gridResolution)
    const nextPointSize =
      typeof params.pointSize === "number" ? params.pointSize : 3
    const nextBloomEnabled = params.bloomEnabled === true

    if (nextResolution !== this.gridResolution) {
      this.gridResolution = nextResolution
      this.resolutionUniform.value = nextResolution
      this.needsRebuild = true
    }

    if (nextPointSize !== (this.pointSizeUniform.value as number)) {
      this.pointSizeUniform.value = nextPointSize
      this.updateFrustumUniforms()
    }

    this.displacementUniform.value =
      typeof params.displacement === "number" ? params.displacement : 0.5

    this.bgColor.set(
      typeof params.backgroundColor === "string"
        ? params.backgroundColor
        : "#000000"
    )

    const noiseAmount =
      typeof params.noiseAmount === "number" ? params.noiseAmount : 0
    this.noiseAmountUniform.value = noiseAmount
    this.noiseScaleUniform.value =
      typeof params.noiseScale === "number" ? params.noiseScale : 3
    this.noiseSpeedUniform.value =
      typeof params.noiseSpeed === "number" ? params.noiseSpeed : 0.5
    this.isAnimated = noiseAmount > 0

    this.bloomIntensityUniform.value =
      typeof params.bloomIntensity === "number"
        ? Math.max(0, params.bloomIntensity)
        : 1.25
    this.bloomThresholdUniform.value =
      typeof params.bloomThreshold === "number"
        ? clamp01(params.bloomThreshold)
        : 0.6
    this.bloomRadiusUniform.value =
      typeof params.bloomRadius === "number"
        ? Math.max(0, params.bloomRadius)
        : 6
    this.bloomSoftnessUniform.value =
      typeof params.bloomSoftness === "number"
        ? clamp01(params.bloomSoftness)
        : 0.35

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = this.bloomIntensityUniform.value as number
      this.bloomNode.radius.value = this.normalizeBloomRadius(
        this.bloomRadiusUniform.value as number
      )
      this.bloomNode.threshold.value = this.bloomThresholdUniform
        .value as number
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
        this.bloomSoftnessUniform.value as number
      )
    }
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.internalRT.setSize(this.width, this.height)
    this.perspCamera.aspect = this.width / this.height
    this.perspCamera.updateProjectionMatrix()
    this.updateFrustumUniforms()
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.clearGrid()
    this.noiseTexture.dispose()
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

    const baseColor = vec3(
      this.blitInputNode.r,
      this.blitInputNode.g,
      this.blitInputNode.b
    )

    if (!this.bloomEnabled) {
      return vec4(baseColor, float(1))
    }

    const bloomInput = vec4(baseColor, float(1))
    this.bloomNode = bloom(
      bloomInput,
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number
    )

    return vec4(
      clamp(
        baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1))
      ),
      float(1)
    )
  }

  private rebuildGrid(): void {
    this.clearGrid()

    const res = this.gridResolution
    const count = res * res

    this.resolutionUniform.value = res
    this.updateFrustumUniforms()

    // Unit quad: 4 vertices, 2 triangles. More vertices than a single triangle but
    // halves the fragment count — the oversized triangle wasted 50% of fragments on
    // pixels outside the circle mask that alphaTest would discard.
    const positions = new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ])
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3])
    const baseGeo = new THREE.BufferGeometry()
    baseGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    baseGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
    baseGeo.setIndex(new THREE.BufferAttribute(indices, 1))

    // Instanced geometry — no per-instance buffers; positions derived from instanceIndex
    const instancedGeo = new THREE.InstancedBufferGeometry()
    instancedGeo.setAttribute("position", baseGeo.getAttribute("position")!)
    instancedGeo.setAttribute("uv", baseGeo.getAttribute("uv")!)
    instancedGeo.setIndex(baseGeo.getIndex()!)
    instancedGeo.instanceCount = count

    // Derive grid position and UV from instanceIndex (eliminates ~334 MB of buffers at 4096)
    const idx = float(instanceIndex)
    const resF = float(this.resolutionUniform)
    const col = idx.mod(resF)
    const row = floor(idx.div(resF))
    const u = col.div(resF.sub(1.0))
    const v = row.div(resF.sub(1.0))

    const gridUv = vec2(u, float(1).sub(v))

    // Sample input texture per instance
    this.inputSamplerNode = tslTexture(this.placeholder, gridUv)
    const sampledColor = this.inputSamplerNode

    // Luma for Z displacement
    const luma = sampledColor.r
      .mul(0.2126)
      .add(sampledColor.g.mul(0.7152))
      .add(sampledColor.b.mul(0.0722))

    // Sample pre-computed noise from GPU compute texture (replaces 2x simplex per vertex)
    const noiseSample = tslTexture(this.noiseTexture, gridUv)
    const noiseOffsetX = noiseSample.r.mul(this.noiseAmountUniform).mul(0.01)
    const noiseOffsetY = noiseSample.g.mul(this.noiseAmountUniform).mul(0.01)

    // World-space offset from instanceIndex
    const offsetX = u.mul(2).sub(1).mul(this.halfWUniform)
    const offsetY = v.mul(2).sub(1).mul(this.halfHUniform)

    // Scale quad vertices by world size, then offset + noise + displacement
    const scaledPos = positionLocal.mul(this.quadSizeUniform)
    const finalPos = vec3(
      scaledPos.x.add(offsetX).add(noiseOffsetX),
      scaledPos.y.add(offsetY).add(noiseOffsetY),
      scaledPos.z.add(luma.mul(this.displacementUniform))
    )

    // Circle mask using quad UV (0–1 per quad)
    // Edge width scales with point size so anti-aliasing is always ~1.5px
    const quadUv = uv()
    const dist = vec2(quadUv.x.sub(0.5), quadUv.y.sub(0.5)).length()
    const aaWidth = float(1.5).div(this.pointSizeUniform)
    const circleMask = smoothstep(float(0.5), float(0.5).sub(aaWidth), dist)

    const material = new THREE.MeshBasicNodeMaterial()
    material.positionNode = finalPos as Node
    material.colorNode = vec4(
      sampledColor.r,
      sampledColor.g,
      sampledColor.b,
      circleMask
    ) as Node
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

  private buildNoiseCompute(): unknown {
    const computeNoiseFn = Fn(({ noiseTex }: { noiseTex: Node }) => {
      const posX = instanceIndex.mod(NOISE_TEX_SIZE)
      const posY = instanceIndex.div(NOISE_TEX_SIZE)
      const nuv = vec2(
        float(posX).div(float(NOISE_TEX_SIZE)),
        float(posY).div(float(NOISE_TEX_SIZE))
      )
      const noiseCoord = nuv
        .mul(float(NOISE_TEX_SIZE))
        .mul(this.noiseScaleUniform)
      const nx = simplexNoise3d(
        vec3(
          noiseCoord.x,
          noiseCoord.y,
          this.timeUniform.mul(this.noiseSpeedUniform)
        )
      )
      const ny = simplexNoise3d(
        vec3(
          noiseCoord.x,
          noiseCoord.y,
          this.timeUniform.mul(this.noiseSpeedUniform).add(float(100))
        )
      )
      textureStore(
        noiseTex,
        uvec2(posX, posY),
        vec4(nx, ny, float(0), float(1))
      ).toWriteOnly()
    })

    return computeNoiseFn({ noiseTex: this.noiseTexture }).compute(
      NOISE_TEX_SIZE * NOISE_TEX_SIZE
    )
  }

  private updateFrustumUniforms(): void {
    const halfH = Math.tan((45 * Math.PI) / 360) * 1.2
    const halfW = halfH * (this.width / this.height)
    this.halfHUniform.value = halfH
    this.halfWUniform.value = halfW
    const pixelsPerUnit = this.height / (2 * halfH)
    const requestedSize =
      (this.pointSizeUniform.value as number) / pixelsPerUnit
    // Cap quad size at 2× grid spacing to prevent catastrophic overdraw.
    // Beyond this point particles fully tile the viewport and extra size
    // only adds invisible overlapping fragments.
    const gridSpacing = (2 * halfW) / Math.max(1, this.gridResolution - 1)
    const maxSize = gridSpacing * 2
    this.quadSizeUniform.value = Math.min(requestedSize, maxSize)
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

    if (
      "getTextureNode" in bloomNode &&
      typeof bloomNode.getTextureNode === "function"
    ) {
      return bloomNode.getTextureNode()
    }

    if (
      "getTexture" in bloomNode &&
      typeof bloomNode.getTexture === "function"
    ) {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }
}
