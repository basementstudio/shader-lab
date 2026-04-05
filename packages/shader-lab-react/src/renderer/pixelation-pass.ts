import {
  float,
  floor,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import type * as THREE from "three/webgpu"
import type { ShaderLabLayerConfig } from "../types"
import { createPipelinePlaceholder, PassNode } from "./pass-node"

type Node = TSLNode

export class PixelationPass extends PassNode {
  private readonly cellSizeUniform: Node
  private readonly aspectRatioUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node

  private sourceTextureNode: Node | null = null
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.cellSizeUniform = uniform(8)
    this.aspectRatioUniform = uniform(1)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (this.sourceTextureNode) {
      this.sourceTextureNode.value = inputTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = width
    this.logicalHeightUniform.value = height
  }

  override updateParams(params: ShaderLabLayerConfig["params"]): void {
    this.cellSizeUniform.value =
      typeof params.cellSize === "number"
        ? Math.max(2, Math.round(params.cellSize))
        : 8
    this.aspectRatioUniform.value =
      typeof params.aspectRatio === "number"
        ? Math.max(0.25, Math.min(4, params.aspectRatio))
        : 1
  }

  protected override buildEffectNode(): Node {
    if (!this.cellSizeUniform) {
      return this.inputNode
    }

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const cellW = this.cellSizeUniform.div(this.logicalWidthUniform)
    const cellH = this.cellSizeUniform
      .mul(this.aspectRatioUniform)
      .div(this.logicalHeightUniform)

    const cellX = floor(renderTargetUv.x.div(cellW))
    const cellY = floor(renderTargetUv.y.div(cellH))
    const cellCenterUv = vec2(
      cellX.add(float(0.5)).mul(cellW),
      cellY.add(float(0.5)).mul(cellH)
    )

    this.sourceTextureNode = tslTexture(this.placeholder, cellCenterUv)
    return vec4(this.sourceTextureNode.rgb, float(1))
  }
}
