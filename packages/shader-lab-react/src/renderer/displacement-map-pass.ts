import {
  clamp,
  float,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { ShaderLabLayerConfig } from "../types"
import { PassNode } from "./pass-node"

type Node = TSLNode

const DIR_BOTH = 0
const DIR_HORIZONTAL = 1
const DIR_VERTICAL = 2

function toDirectionValue(value: unknown): number {
  switch (value) {
    case "horizontal":
      return DIR_HORIZONTAL
    case "vertical":
      return DIR_VERTICAL
    default:
      return DIR_BOTH
  }
}

export class DisplacementMapPass extends PassNode {
  private directionMode = DIR_BOTH

  private readonly strengthUniform: Node
  private readonly midpointUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private channelMode: "luminance" | "red" | "green" | "blue" = "luminance"

  private sourceTextureNodes: Node[] = []
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.strengthUniform = uniform(20)
    this.midpointUniform = uniform(0.5)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override resize(width: number, height: number): void {
    this.widthUniform.value = width
    this.heightUniform.value = height
  }

  override updateParams(params: ShaderLabLayerConfig["params"]): void {
    this.strengthUniform.value =
      typeof params.strength === "number"
        ? Math.max(0, Math.min(200, params.strength))
        : 20
    this.midpointUniform.value =
      typeof params.midpoint === "number"
        ? Math.max(0, Math.min(1, params.midpoint))
        : 0.5

    const nextDirection = toDirectionValue(params.direction)
    const nextChannel = (
      typeof params.channel === "string" ? params.channel : "luminance"
    ) as typeof this.channelMode

    if (
      nextDirection !== this.directionMode ||
      nextChannel !== this.channelMode
    ) {
      this.directionMode = nextDirection
      this.channelMode = nextChannel
      this.rebuildEffectNode()
    }
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.strengthUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const srcSample = this.trackSourceTextureNode(renderTargetUv)

    let channelValue: Node
    switch (this.channelMode) {
      case "red":
        channelValue = float(srcSample.r)
        break
      case "green":
        channelValue = float(srcSample.g)
        break
      case "blue":
        channelValue = float(srcSample.b)
        break
      default:
        channelValue = float(srcSample.r)
          .mul(float(0.2126))
          .add(float(srcSample.g).mul(float(0.7152)))
          .add(float(srcSample.b).mul(float(0.0722)))
    }

    const offset = channelValue.sub(this.midpointUniform)
    const offsetX = offset.mul(this.strengthUniform).div(this.widthUniform)
    const offsetY = offset.mul(this.strengthUniform).div(this.heightUniform)

    let displacedUv: Node
    switch (this.directionMode) {
      case DIR_HORIZONTAL:
        displacedUv = vec2(
          clamp(renderTargetUv.x.add(offsetX), float(0), float(1)),
          renderTargetUv.y
        )
        break
      case DIR_VERTICAL:
        displacedUv = vec2(
          renderTargetUv.x,
          clamp(renderTargetUv.y.add(offsetY), float(0), float(1))
        )
        break
      default:
        displacedUv = vec2(
          clamp(renderTargetUv.x.add(offsetX), float(0), float(1)),
          clamp(renderTargetUv.y.add(offsetY), float(0), float(1))
        )
    }

    const displacedColor = this.trackSourceTextureNode(displacedUv)
    return vec4(displacedColor.rgb, float(1))
  }
}
