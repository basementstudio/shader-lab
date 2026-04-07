import {
  clamp,
  float,
  mix,
  select,
  sqrt,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { ShaderLabLayerConfig } from "../types"
import { createPipelinePlaceholder, PassNode } from "./pass-node"

type Node = TSLNode

const COLOR_MODE_OVERLAY = 0
const COLOR_MODE_MONO = 1
const COLOR_MODE_SOURCE = 2

function hexToVec3(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "").padEnd(6, "0").slice(0, 6)
  const color = new THREE.Color(`#${normalized}`)

  return [color.r, color.g, color.b]
}

function toColorModeValue(value: unknown): number {
  switch (value) {
    case "mono":
      return COLOR_MODE_MONO
    case "source":
      return COLOR_MODE_SOURCE
    default:
      return COLOR_MODE_OVERLAY
  }
}

export class EdgeDetectPass extends PassNode {
  private colorMode = COLOR_MODE_OVERLAY

  private readonly thresholdUniform: Node
  private readonly strengthUniform: Node
  private readonly invertUniform: Node
  private readonly lineColorRUniform: Node
  private readonly lineColorGUniform: Node
  private readonly lineColorBUniform: Node
  private readonly bgColorRUniform: Node
  private readonly bgColorGUniform: Node
  private readonly bgColorBUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private sourceTextureNodes: Node[] = []
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.thresholdUniform = uniform(0.1)
    this.strengthUniform = uniform(1)
    this.invertUniform = uniform(0)
    this.lineColorRUniform = uniform(1)
    this.lineColorGUniform = uniform(1)
    this.lineColorBUniform = uniform(1)
    this.bgColorRUniform = uniform(0)
    this.bgColorGUniform = uniform(0)
    this.bgColorBUniform = uniform(0)
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
    this.thresholdUniform.value =
      typeof params.threshold === "number"
        ? Math.max(0, Math.min(1, params.threshold))
        : 0.1
    this.strengthUniform.value =
      typeof params.strength === "number"
        ? Math.max(0.1, Math.min(5, params.strength))
        : 1
    this.invertUniform.value = params.invert === true ? 1 : 0

    const nextColorMode = toColorModeValue(params.colorMode)
    if (nextColorMode !== this.colorMode) {
      this.colorMode = nextColorMode
      this.rebuildEffectNode()
    }

    if (typeof params.lineColor === "string") {
      const [r, g, b] = hexToVec3(params.lineColor)
      this.lineColorRUniform.value = r
      this.lineColorGUniform.value = g
      this.lineColorBUniform.value = b
    }
    if (typeof params.bgColor === "string") {
      const [r, g, b] = hexToVec3(params.bgColor)
      this.bgColorRUniform.value = r
      this.bgColorGUniform.value = g
      this.bgColorBUniform.value = b
    }
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.thresholdUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const texelX = float(1).div(this.widthUniform)
    const texelY = float(1).div(this.heightUniform)

    const sampleLuma = (dx: Node, dy: Node) => {
      const sampleUv = vec2(renderTargetUv.x.add(dx), renderTargetUv.y.add(dy))
      const s = this.trackSourceTextureNode(sampleUv)
      return float(s.r)
        .mul(float(0.2126))
        .add(float(s.g).mul(float(0.7152)))
        .add(float(s.b).mul(float(0.0722)))
    }

    const tl = sampleLuma(texelX.negate(), texelY.negate())
    const tc = sampleLuma(float(0), texelY.negate())
    const tr = sampleLuma(texelX, texelY.negate())
    const ml = sampleLuma(texelX.negate(), float(0))
    const mr = sampleLuma(texelX, float(0))
    const bl = sampleLuma(texelX.negate(), texelY)
    const bc = sampleLuma(float(0), texelY)
    const br = sampleLuma(texelX, texelY)

    const gx = tl
      .mul(float(-1))
      .add(tr)
      .add(ml.mul(float(-2)))
      .add(mr.mul(float(2)))
      .add(bl.mul(float(-1)))
      .add(br)
    const gy = tl
      .mul(float(-1))
      .add(tc.mul(float(-2)))
      .add(tr.mul(float(-1)))
      .add(bl)
      .add(bc.mul(float(2)))
      .add(br)

    const edgeMagnitude = clamp(
      sqrt(gx.mul(gx).add(gy.mul(gy))).mul(this.strengthUniform),
      float(0),
      float(1)
    )

    const edge = select(
      edgeMagnitude.greaterThan(this.thresholdUniform),
      edgeMagnitude,
      float(0)
    )
    const finalEdge = mix(edge, float(1).sub(edge), this.invertUniform)
    const centerColor = this.trackSourceTextureNode(renderTargetUv)

    if (this.colorMode === COLOR_MODE_MONO) {
      const lineCol = vec3(
        this.lineColorRUniform,
        this.lineColorGUniform,
        this.lineColorBUniform
      )
      const bgCol = vec3(
        this.bgColorRUniform,
        this.bgColorGUniform,
        this.bgColorBUniform
      )
      return vec4(mix(bgCol, lineCol, finalEdge), float(1))
    }

    if (this.colorMode === COLOR_MODE_SOURCE) {
      return vec4(centerColor.rgb.mul(finalEdge), float(1))
    }

    return vec4(
      mix(centerColor.rgb, vec3(float(1), float(1), float(1)), finalEdge),
      float(1)
    )
  }
}
