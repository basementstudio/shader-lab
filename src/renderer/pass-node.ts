import * as THREE from "three/webgpu"
import {
  clamp,
  cos,
  float,
  max,
  min,
  mix,
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
import { buildBlendColorNode, buildBlendNode } from "@/renderer/blend-modes"
import type {
  LayerCompositeMode,
  LayerParameterValues,
  MaskConfig,
  SceneConfig,
} from "@/types/editor"

type Node = TSLNode
type PassCompositionStrategy = "effect" | "source"

export class PassNode {
  readonly layerId: string

  enabled = true

  protected readonly scene: THREE.Scene
  protected readonly camera: THREE.OrthographicCamera
  protected readonly material: THREE.MeshBasicNodeMaterial
  protected readonly inputNode: Node
  protected effectNode: Node
  protected readonly hueUniform: Node
  protected readonly saturationUniform: Node

  private readonly opacityUniform: Node
  private readonly opaqueBackgroundUniform: Node
  private blendMode = "normal"
  private compositeMode: LayerCompositeMode = "filter"
  private compositionStrategy: PassCompositionStrategy
  private maskSource = "luminance"
  private maskMode = "multiply"
  private maskInvert = false
  private colorNodeDirty = false

  constructor(layerId: string, compositionStrategy: PassCompositionStrategy = "effect") {
    this.layerId = layerId
    this.compositionStrategy = compositionStrategy
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.material.blending = THREE.NoBlending
    this.material.depthWrite = false
    this.material.transparent = true
    this.opacityUniform = uniform(1)
    this.opaqueBackgroundUniform = uniform(1)
    this.hueUniform = uniform(0)
    this.saturationUniform = uniform(1)

    const placeholder = new THREE.Texture()
    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    this.inputNode = tslTexture(placeholder, renderTargetUv)
    this.effectNode = this.buildEffectNode()
    this.rebuildColorNode()

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
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

  updateCommonParams(params: LayerParameterValues): void {
    this.opaqueBackgroundUniform.value = params.opaqueBackground === false ? 0 : 1
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

  updateSceneConfig(_config: SceneConfig): boolean {
    return false
  }

  updateOutputCropAspectRatio(_ratio: number | null): boolean {
    return false
  }

  needsContinuousRender(): boolean {
    return false
  }

  async prepareForExportFrame(_time: number, _loop: boolean): Promise<void> {
    // Default pass has no export-specific media work.
  }

  dispose(): void {
    this.scene.clear()
    this.material.dispose()
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

  protected setCompositionStrategy(strategy: PassCompositionStrategy): void {
    if (strategy === this.compositionStrategy) {
      return
    }

    this.compositionStrategy = strategy
    this.colorNodeDirty = true
  }

  protected buildEffectNode(): Node {
    return this.inputNode
  }

  protected rebuildEffectNode(): void {
    this.effectNode = this.buildEffectNode()
    this.colorNodeDirty = false
    this.rebuildColorNode()
    this.material.needsUpdate = true
  }

  protected rebuildColorNode(): void {
    const adjustedEffectNode = this.applySharedColorAdjustments(this.effectNode)
    if (
      this.compositionStrategy === "source" ||
      this.compositeMode === "mask"
    ) {
      const blendedNode = buildBlendNode(
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

      this.material.colorNode = vec3(
        float(blendedNode.r),
        float(blendedNode.g),
        float(blendedNode.b)
      )
      this.material.opacityNode = float(blendedNode.a)
      return
    }

    const baseColor = vec3(
      float(this.inputNode.r),
      float(this.inputNode.g),
      float(this.inputNode.b),
    )
    const baseAlpha = clamp(float(this.inputNode.a), float(0), float(1))
    const effectColor = vec3(
      float(adjustedEffectNode.r),
      float(adjustedEffectNode.g),
      float(adjustedEffectNode.b),
    )
    const effectAlpha = clamp(float(adjustedEffectNode.a), float(0), float(1))
    const normalizedOpacity = clamp(float(this.opacityUniform), float(0), float(1))
    const preservedEffectAlpha = min(effectAlpha, baseAlpha)
    const visibleEffectAlpha = mix(
      preservedEffectAlpha,
      effectAlpha,
      this.opaqueBackgroundUniform,
    )
    const effectColorCoverage = select(
      effectAlpha.greaterThan(float(1e-6)),
      visibleEffectAlpha.div(max(effectAlpha, float(1e-6))),
      float(0),
    )
    const alphaAwareEffectColor = mix(baseColor, effectColor, effectColorCoverage)
    const transformedColor = buildBlendColorNode(
      this.blendMode,
      baseColor,
      alphaAwareEffectColor,
    ) as Node
    const resultColor = mix(baseColor, transformedColor, normalizedOpacity)
    const resultAlpha = mix(baseAlpha, visibleEffectAlpha, normalizedOpacity)

    this.material.colorNode = clamp(
      vec3(
        float(resultColor.x),
        float(resultColor.y),
        float(resultColor.z),
      ),
      vec3(float(0), float(0), float(0)),
      vec3(float(1), float(1), float(1)),
    )
    this.material.opacityNode = clamp(resultAlpha, float(0), float(1))
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
