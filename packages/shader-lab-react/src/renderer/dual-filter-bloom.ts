import { createPipelinePlaceholder } from "./pass-node"
import {
  add,
  float,
  max,
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

type Node = TSLNode

const TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

const MAX_LEVELS = 10
const MIN_LEVEL_SIZE = 4
const MIN_ACTIVE_LEVELS = 2
const LEVEL_GAIN = 4.4
const MAX_BLOOM = 2
const MAX_INTENSITY = 2

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

export type DualFilterBloomOptions = {
  baseDivisor?: number
}

type Stage = {
  material: THREE.MeshBasicNodeMaterial
  scene: THREE.Scene
}

export class DualFilterBloom {
  readonly softnessUniform: Node
  private readonly normalizationUniform: Node
  readonly strengthUniform: Node
  readonly thresholdUniform: Node

  private readonly baseDivisor: number
  private readonly camera: THREE.OrthographicCamera
  private readonly geometry: THREE.PlaneGeometry
  private readonly placeholder: THREE.Texture

  private readonly downTargets: THREE.WebGLRenderTarget[] = []
  private readonly upTargets: THREE.WebGLRenderTarget[] = []
  private readonly texelUniforms: Node[] = []

  private readonly prefilterStage: Stage
  private readonly prefilterInput: Node
  private readonly downStages: Stage[] = []
  private readonly downInputs: Node[] = []
  private readonly upStages: Stage[] = []
  private readonly upCoarseInputs: Node[] = []
  private readonly upFineInputs: Node[] = []

  private readonly resultTextureNode: Node
  private readonly resultNode: Node

  private width = 0
  private height = 0
  private availableLevels = 1
  private activeLevels = 1
  private radius = 1

  constructor(options: DualFilterBloomOptions = {}) {
    this.baseDivisor = Math.max(1, options.baseDivisor ?? 2)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.geometry = new THREE.PlaneGeometry(2, 2)
    this.placeholder = createPipelinePlaceholder()

    this.strengthUniform = uniform(1)
    this.thresholdUniform = uniform(0)
    this.softnessUniform = uniform(0.1)
    this.normalizationUniform = uniform(LEVEL_GAIN)

    for (let level = 0; level < MAX_LEVELS; level += 1) {
      this.downTargets.push(new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS))
      this.texelUniforms.push(uniform(new THREE.Vector2(1, 1)))
    }

    for (let level = 0; level < MAX_LEVELS - 1; level += 1) {
      this.upTargets.push(new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS))
    }

    this.prefilterStage = this.createStage()
    this.prefilterInput = tslTexture(this.placeholder, renderTargetUv())
    this.prefilterStage.material.colorNode = this.buildPrefilterNode(
      this.prefilterInput
    )

    for (let level = 1; level < MAX_LEVELS; level += 1) {
      const stage = this.createStage()
      const input = tslTexture(this.placeholder, renderTargetUv())
      stage.material.colorNode = this.buildDownsampleNode(
        input,
        this.texelUniforms[level - 1] as Node
      )
      this.downStages.push(stage)
      this.downInputs.push(input)
    }

    for (let level = 0; level < MAX_LEVELS - 1; level += 1) {
      const stage = this.createStage()
      const coarse = tslTexture(this.placeholder, renderTargetUv())
      const fine = tslTexture(this.placeholder, renderTargetUv())
      stage.material.colorNode = this.buildUpsampleNode(
        coarse,
        fine,
        this.texelUniforms[level + 1] as Node
      )
      this.upStages.push(stage)
      this.upCoarseInputs.push(coarse)
      this.upFineInputs.push(fine)
    }

    this.resultTextureNode = tslTexture(this.placeholder, renderTargetUv())
    this.resultNode = this.resultTextureNode.rgb
      .mul(this.normalizationUniform)
      .mul(this.strengthUniform)
      .clamp(vec3(0, 0, 0), vec3(MAX_BLOOM, MAX_BLOOM, MAX_BLOOM))
  }

  private createStage(): Stage {
    const material = new THREE.MeshBasicNodeMaterial()
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false

    const scene = new THREE.Scene()
    scene.add(mesh)

    return { material, scene }
  }

  private buildPrefilterNode(input: Node): Node {
    const luminance = input.rgb.dot(vec3(0.2126, 0.7152, 0.0722))
    const knee = max(this.softnessUniform, float(1e-4))
    const alpha = smoothstep(
      this.thresholdUniform,
      this.thresholdUniform.add(knee),
      luminance
    )

    return vec4(input.rgb.mul(alpha), float(1))
  }

  private buildDownsampleNode(input: Node, texel: Node): Node {
    const sourceUv = renderTargetUv()
    const tap = (dx: number, dy: number): Node =>
      input
        .sample(
          sourceUv.add(vec2(texel.x.mul(float(dx)), texel.y.mul(float(dy))))
        )
        .rgb

    const center = tap(0, 0)
    const inner = add(add(tap(-1, -1), tap(1, -1)), add(tap(-1, 1), tap(1, 1)))
    const cardinal = add(add(tap(-2, 0), tap(2, 0)), add(tap(0, -2), tap(0, 2)))
    const corners = add(
      add(tap(-2, -2), tap(2, -2)),
      add(tap(-2, 2), tap(2, 2))
    )

    return vec4(
      center
        .mul(float(0.125))
        .add(inner.mul(float(0.125)))
        .add(cardinal.mul(float(0.0625)))
        .add(corners.mul(float(0.03125))),
      float(1)
    )
  }

  private buildUpsampleNode(coarse: Node, fine: Node, texel: Node): Node {
    const sourceUv = renderTargetUv()
    const tap = (dx: number, dy: number): Node =>
      coarse
        .sample(
          sourceUv.add(vec2(texel.x.mul(float(dx)), texel.y.mul(float(dy))))
        )
        .rgb

    const tent = tap(0, 0)
      .mul(float(0.25))
      .add(
        add(add(tap(-1, 0), tap(1, 0)), add(tap(0, -1), tap(0, 1))).mul(
          float(0.125)
        )
      )
      .add(
        add(add(tap(-1, -1), tap(1, -1)), add(tap(-1, 1), tap(1, 1))).mul(
          float(0.0625)
        )
      )

    return vec4(fine.rgb.add(tent), float(1))
  }

  getTextureNode(): Node {
    return this.resultNode
  }

  setRadius(radius: number): void {
    this.radius = Math.max(0, Math.min(1, radius))
    this.recomputeActiveLevels()
  }

  private recomputeActiveLevels(): void {
    const span = Math.max(0, this.availableLevels - MIN_ACTIVE_LEVELS)
    this.activeLevels = Math.max(
      1,
      Math.min(
        this.availableLevels,
        MIN_ACTIVE_LEVELS + Math.round(this.radius * span)
      )
    )
    this.normalizationUniform.value = LEVEL_GAIN / Math.max(1, this.activeLevels)
  }

  setSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width / this.baseDivisor))
    const nextHeight = Math.max(1, Math.floor(height / this.baseDivisor))

    if (nextWidth === this.width && nextHeight === this.height) {
      return
    }

    this.width = nextWidth
    this.height = nextHeight

    let levelWidth = nextWidth
    let levelHeight = nextHeight
    let available = 0

    for (let level = 0; level < MAX_LEVELS; level += 1) {
      if (
        level > 0 &&
        (levelWidth < MIN_LEVEL_SIZE || levelHeight < MIN_LEVEL_SIZE)
      ) {
        break
      }

      ;(this.downTargets[level] as THREE.WebGLRenderTarget).setSize(
        levelWidth,
        levelHeight
      )

      if (level < this.upTargets.length) {
        ;(this.upTargets[level] as THREE.WebGLRenderTarget).setSize(
          levelWidth,
          levelHeight
        )
      }

      ;(this.texelUniforms[level] as Node).value = new THREE.Vector2(
        1 / levelWidth,
        1 / levelHeight
      )

      available += 1
      levelWidth = Math.max(1, Math.floor(levelWidth / 2))
      levelHeight = Math.max(1, Math.floor(levelHeight / 2))
    }

    this.availableLevels = Math.max(1, available)
    this.recomputeActiveLevels()
  }

  render(renderer: THREE.WebGPURenderer, inputTexture: THREE.Texture): void {
    const levels = this.activeLevels

    this.prefilterInput.value = inputTexture
    renderer.setRenderTarget(this.downTargets[0] as THREE.WebGLRenderTarget)
    renderer.render(this.prefilterStage.scene, this.camera)

    for (let level = 1; level < levels; level += 1) {
      ;(this.downInputs[level - 1] as Node).value = (
        this.downTargets[level - 1] as THREE.WebGLRenderTarget
      ).texture
      renderer.setRenderTarget(
        this.downTargets[level] as THREE.WebGLRenderTarget
      )
      renderer.render((this.downStages[level - 1] as Stage).scene, this.camera)
    }

    if (levels === 1) {
      this.resultTextureNode.value = (
        this.downTargets[0] as THREE.WebGLRenderTarget
      ).texture
      return
    }

    let coarseTexture = (
      this.downTargets[levels - 1] as THREE.WebGLRenderTarget
    ).texture

    const finestLevel = levels >= 3 ? 1 : 0

    for (let level = levels - 2; level >= finestLevel; level -= 1) {
      ;(this.upCoarseInputs[level] as Node).value = coarseTexture
      ;(this.upFineInputs[level] as Node).value = (
        this.downTargets[level] as THREE.WebGLRenderTarget
      ).texture

      const target = this.upTargets[level] as THREE.WebGLRenderTarget
      renderer.setRenderTarget(target)
      renderer.render((this.upStages[level] as Stage).scene, this.camera)
      coarseTexture = target.texture
    }

    this.resultTextureNode.value = coarseTexture
  }

  dispose(): void {
    for (const target of [...this.downTargets, ...this.upTargets]) {
      target.dispose()
    }

    for (const stage of [
      this.prefilterStage,
      ...this.downStages,
      ...this.upStages,
    ]) {
      stage.material.dispose()
      stage.scene.clear()
    }

    this.geometry.dispose()
    this.placeholder.dispose()
  }
}

const CORE_TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

export type BloomSettings = {
  intensity: number
  radius: number
  softness: number
  threshold: number
}

export function normalizeBloomRadius(value: number): number {
  return Math.max(0, Math.min(1, value / 24))
}

export function normalizeBloomSoftness(value: number): number {
  return Math.max(0.001, value * 0.25)
}

export class BloomCompositor {
  private readonly bloom: DualFilterBloom
  private readonly camera: THREE.OrthographicCamera
  private readonly geometry: THREE.PlaneGeometry
  private readonly material: THREE.MeshBasicNodeMaterial
  private readonly scene: THREE.Scene
  private readonly target: THREE.WebGLRenderTarget

  constructor(options: DualFilterBloomOptions = {}) {
    this.bloom = new DualFilterBloom(options)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.geometry = new THREE.PlaneGeometry(2, 2)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.target = new THREE.WebGLRenderTarget(1, 1, CORE_TARGET_OPTIONS)

    const mesh = new THREE.Mesh(this.geometry, this.material)
    mesh.frustumCulled = false
    this.scene = new THREE.Scene()
    this.scene.add(mesh)
  }

  build(source: Node, baseColor?: Node): Node {
    this.material.colorNode = vec4(source, float(1))
    this.material.needsUpdate = true

    const coreTexture = tslTexture(this.target.texture, renderTargetUv())
    const base = baseColor ?? coreTexture.rgb

    return vec4(
      base
        .add(this.bloom.getTextureNode())
        .clamp(vec3(0, 0, 0), vec3(1, 1, 1)),
      float(1)
    )
  }

  applySettings(settings: BloomSettings): void {
    this.bloom.strengthUniform.value = Math.max(
      0,
      Math.min(MAX_INTENSITY, settings.intensity)
    )
    this.bloom.thresholdUniform.value = settings.threshold
    this.bloom.softnessUniform.value = normalizeBloomSoftness(settings.softness)
    this.bloom.setRadius(normalizeBloomRadius(settings.radius))
  }

  setSize(width: number, height: number): void {
    const nextWidth = Math.max(1, width)
    const nextHeight = Math.max(1, height)

    if (this.target.width !== nextWidth || this.target.height !== nextHeight) {
      this.target.setSize(nextWidth, nextHeight)
    }

    this.bloom.setSize(nextWidth, nextHeight)
  }

  render(renderer: THREE.WebGPURenderer): void {
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    this.bloom.render(renderer, this.target.texture)
  }

  dispose(): void {
    this.bloom.dispose()
    this.target.dispose()
    this.material.dispose()
    this.geometry.dispose()
    this.scene.clear()
  }
}
