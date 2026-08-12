import * as THREE from "three/webgpu"
import {
  clamp,
  cos,
  float,
  mix,
  sin,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { buildBlendNode } from "./blend-modes"
import type { LayerCompositeMode, LayerParameterValues, MaskConfig } from "../types/editor"

type Node = TSLNode

/**
 * Creates a placeholder texture whose format/type matches the pipeline render
 * targets (`HalfFloatType`, `RGBAFormat`, nearest filtering, no mipmaps).
 * Using a matching placeholder avoids a potential Three.js TSL pipeline
 * recompilation when the real render-target texture is first assigned.
 */
export function createPipelinePlaceholder(): THREE.Texture {
  const tex = new THREE.Texture()
  tex.type = THREE.HalfFloatType
  tex.format = THREE.RGBAFormat
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

export class PassNode {
  readonly layerId: string

  enabled = true

  protected readonly scene: THREE.Scene
  protected readonly camera: THREE.OrthographicCamera
  protected material: THREE.MeshBasicNodeMaterial
  protected readonly inputNode: Node
  protected effectNode: Node
  protected readonly hueUniform: Node
  protected readonly saturationUniform: Node
  protected lastRenderer: THREE.WebGPURenderer | null = null

  private readonly opacityUniform: Node
  private readonly compositeGeometry: THREE.PlaneGeometry
  private readonly compositeMesh: THREE.Mesh
  private lastOutputTarget: THREE.WebGLRenderTarget | null = null
  private effectSwapGeneration = 0
  private blendMode = "normal"
  private compositeMode: LayerCompositeMode = "filter"
  private maskSource = "luminance"
  private maskMode = "multiply"
  private maskInvert = false
  private colorNodeDirty = false

  constructor(layerId: string) {
    this.layerId = layerId
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.opacityUniform = uniform(1)
    this.hueUniform = uniform(0)
    this.saturationUniform = uniform(1)

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    this.inputNode = tslTexture(createPipelinePlaceholder(), renderTargetUv)
    this.effectNode = this.buildEffectNode()
    this.rebuildColorNode()

    this.compositeGeometry = new THREE.PlaneGeometry(2, 2)
    this.compositeMesh = new THREE.Mesh(this.compositeGeometry, this.material)
    this.compositeMesh.frustumCulled = false
    this.scene.add(this.compositeMesh)
  }

  render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    this.lastRenderer = renderer
    this.lastOutputTarget = outputTarget
    this.inputNode.value = inputTexture
    this.beforeRender(time, delta)
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
  }

  updateOpacity(opacity: number): void {
    this.opacityUniform.value = opacity
  }

  updateBlendMode(blendMode: string): boolean {
    if (blendMode === this.blendMode) {
      return false
    }

    this.blendMode = blendMode
    this.colorNodeDirty = true
    return true
  }

  updateCompositeMode(compositeMode: LayerCompositeMode): boolean {
    if (compositeMode === this.compositeMode) {
      return false
    }

    this.compositeMode = compositeMode
    this.colorNodeDirty = true
    return true
  }

  updateMaskConfig(config: MaskConfig): void {
    const structuralChange =
      config.source !== this.maskSource ||
      config.mode !== this.maskMode ||
      config.invert !== this.maskInvert

    this.maskSource = config.source
    this.maskMode = config.mode
    this.maskInvert = config.invert

    if (structuralChange) {
      this.colorNodeDirty = true
    }
  }

  flushColorNode(): void {
    if (!this.colorNodeDirty) {
      return
    }

    this.colorNodeDirty = false
    this.rebuildColorNode()
    this.material.needsUpdate = true
  }

  updateLayerColorAdjustments(hue: number, saturation: number): void {
    this.hueUniform.value = (hue * Math.PI) / 180
    this.saturationUniform.value = Math.max(0, saturation)
  }

  updateParams(_params: LayerParameterValues): void {
    // Default pass has no per-layer parameter handling.
  }

  resize(_width: number, _height: number): void {
    // Default pass has no resize-dependent uniforms.
  }

  updateLogicalSize(_width: number, _height: number): void {
    // Default pass has no logical-size-dependent uniforms.
  }

  needsContinuousRender(): boolean {
    return false
  }

  dispose(): void {
    this.effectSwapGeneration += 1
    this.scene.clear()
    this.material.dispose()
    this.compositeGeometry.dispose()
  }

  getMaterialVersion(): number {
    return this.material.version
  }

  getCompileTarget(): { scene: THREE.Scene; camera: THREE.Camera } {
    return { scene: this.scene, camera: this.camera }
  }

  protected beforeRender(_time: number, _delta: number): void {
    // Default pass has no per-frame work.
  }

  protected buildEffectNode(): Node {
    return this.inputNode
  }

  protected rebuildEffectNode(): void {
    this.effectSwapGeneration += 1
    this.effectNode = this.buildEffectNode()
    this.colorNodeDirty = false
    this.rebuildColorNode()
    this.material.needsUpdate = true
  }

  protected async swapEffectNodeAsync(nextEffectNode: Node): Promise<boolean> {
    const renderer = this.lastRenderer

    if (!renderer) {
      this.effectSwapGeneration += 1
      this.effectNode = nextEffectNode
      this.colorNodeDirty = false
      this.rebuildColorNode()
      this.material.needsUpdate = true
      return true
    }

    const generation = ++this.effectSwapGeneration
    const nextMaterial = new THREE.MeshBasicNodeMaterial()
    nextMaterial.colorNode = this.composeColorNode(nextEffectNode)

    const standbyScene = new THREE.Scene()
    const standbyMesh = new THREE.Mesh(this.compositeGeometry, nextMaterial)
    standbyMesh.frustumCulled = false
    standbyScene.add(standbyMesh)

    const compiler = renderer as unknown as {
      compileAsync(scene: THREE.Scene, camera: THREE.Camera): Promise<void>
      getRenderTarget(): THREE.WebGLRenderTarget | null
      setRenderTarget(target: THREE.WebGLRenderTarget | null): void
    }
    const previousTarget = compiler.getRenderTarget()

    if (this.lastOutputTarget) {
      compiler.setRenderTarget(this.lastOutputTarget)
    }

    try {
      await compiler.compileAsync(standbyScene, this.camera)
    } finally {
      compiler.setRenderTarget(previousTarget)
    }

    standbyScene.remove(standbyMesh)

    if (generation !== this.effectSwapGeneration) {
      nextMaterial.dispose()
      return false
    }

    const previousMaterial = this.material
    this.effectNode = nextEffectNode
    this.colorNodeDirty = false
    this.material = nextMaterial
    this.compositeMesh.material = nextMaterial
    previousMaterial.dispose()
    return true
  }

  protected rebuildColorNode(): void {
    this.material.colorNode = this.composeColorNode(this.effectNode)
  }

  private composeColorNode(effectNode: Node): Node {
    const adjustedEffectNode = this.applySharedColorAdjustments(effectNode)
    return buildBlendNode(
      this.blendMode,
      this.inputNode,
      adjustedEffectNode,
      this.opacityUniform,
      this.compositeMode,
      this.compositeMode === "mask"
        ? {
            invert: this.maskInvert,
            mode: this.maskMode,
            source: this.maskSource,
          }
        : undefined,
    ) as Node
  }

  private applySharedColorAdjustments(sourceNode: Node): Node {
    const sourceColor = vec3(
      float(sourceNode.r),
      float(sourceNode.g),
      float(sourceNode.b),
    )
    const sourceAlpha = clamp(float(sourceNode.a), float(0), float(1))
    const luma = float(sourceColor.x)
      .mul(float(0.2126))
      .add(float(sourceColor.y).mul(float(0.7152)))
      .add(float(sourceColor.z).mul(float(0.0722)))
    const saturated = mix(vec3(luma, luma, luma), sourceColor, this.saturationUniform)
    const hueCos = float(cos(this.hueUniform))
    const hueSin = float(sin(this.hueUniform))
    const rotated = vec3(
      float(saturated.x)
        .mul(float(0.213).add(hueCos.mul(float(0.787))).sub(hueSin.mul(float(0.213))))
        .add(
          float(saturated.y).mul(
            float(0.715).sub(hueCos.mul(float(0.715))).sub(hueSin.mul(float(0.715))),
          ),
        )
        .add(
          float(saturated.z).mul(
            float(0.072).sub(hueCos.mul(float(0.072))).add(hueSin.mul(float(0.928))),
          ),
        ),
      float(saturated.x)
        .mul(float(0.213).sub(hueCos.mul(float(0.213))).add(hueSin.mul(float(0.143))))
        .add(
          float(saturated.y).mul(
            float(0.715).add(hueCos.mul(float(0.285))).add(hueSin.mul(float(0.14))),
          ),
        )
        .add(
          float(saturated.z).mul(
            float(0.072).sub(hueCos.mul(float(0.072))).sub(hueSin.mul(float(0.283))),
          ),
        ),
      float(saturated.x)
        .mul(float(0.213).sub(hueCos.mul(float(0.213))).sub(hueSin.mul(float(0.787))))
        .add(
          float(saturated.y).mul(
            float(0.715).sub(hueCos.mul(float(0.715))).add(hueSin.mul(float(0.715))),
          ),
        )
        .add(
          float(saturated.z).mul(
            float(0.072).add(hueCos.mul(float(0.928))).add(hueSin.mul(float(0.072))),
          ),
        ),
    )

    return vec4(
      clamp(rotated, vec3(float(0), float(0), float(0)), vec3(float(1), float(1), float(1))),
      sourceAlpha,
    )
  }
}
