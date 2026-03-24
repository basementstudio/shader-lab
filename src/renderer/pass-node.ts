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
import { buildBlendNode } from "@/renderer/blend-modes"
import type { LayerCompositeMode, LayerParameterValues } from "@/types/editor"

type Node = TSLNode

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
  private blendMode = "normal"
  private compositeMode: LayerCompositeMode = "filter"

  constructor(layerId: string) {
    this.layerId = layerId
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.opacityUniform = uniform(1)
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
    this.rebuildColorNode()
    this.material.needsUpdate = true
    return true
  }

  updateCompositeMode(compositeMode: LayerCompositeMode): boolean {
    if (compositeMode === this.compositeMode) {
      return false
    }

    this.compositeMode = compositeMode
    this.rebuildColorNode()
    this.material.needsUpdate = true
    return true
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
    this.scene.clear()
    this.material.dispose()
  }

  getMaterialVersion(): number {
    return this.material.version
  }

  protected beforeRender(_time: number, _delta: number): void {
    // Default pass has no per-frame work.
  }

  protected buildEffectNode(): Node {
    return this.inputNode
  }

  protected rebuildEffectNode(): void {
    this.effectNode = this.buildEffectNode()
    this.rebuildColorNode()
    this.material.needsUpdate = true
  }

  protected rebuildColorNode(): void {
    const adjustedEffectNode = this.applySharedColorAdjustments(this.effectNode)
    this.material.colorNode = buildBlendNode(
      this.blendMode,
      this.inputNode,
      adjustedEffectNode,
      this.opacityUniform,
      this.compositeMode,
    ) as Node
  }

  private applySharedColorAdjustments(sourceNode: Node): Node {
    const sourceColor = vec3(
      float(sourceNode.r),
      float(sourceNode.g),
      float(sourceNode.b),
    )
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
      float(1),
    )
  }
}
