import {
  clamp,
  cos,
  float,
  length,
  sin,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const DIR_RADIAL = 0
const DIR_HORIZONTAL = 1
const DIR_VERTICAL = 2

function toDirectionValue(value: unknown): number {
  switch (value) {
    case "horizontal":
      return DIR_HORIZONTAL
    case "vertical":
      return DIR_VERTICAL
    default:
      return DIR_RADIAL
  }
}

export class ChromaticAberrationPass extends PassNode {
  private directionMode = DIR_RADIAL

  private readonly intensityUniform: Node
  private readonly centerXUniform: Node
  private readonly centerYUniform: Node
  private readonly angleUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  private sourceTextureNodes: Node[] = []
  private readonly placeholder: THREE.Texture

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.intensityUniform = uniform(5)
    this.centerXUniform = uniform(0.5)
    this.centerYUniform = uniform(0.5)
    this.angleUniform = uniform(0)
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

  override updateParams(params: LayerParameterValues): void {
    this.intensityUniform.value =
      typeof params.intensity === "number"
        ? Math.max(0, Math.min(50, params.intensity))
        : 5

    if (Array.isArray(params.center) && params.center.length >= 2) {
      this.centerXUniform.value = params.center[0] as number
      this.centerYUniform.value = params.center[1] as number
    }

    if (typeof params.angle === "number") {
      this.angleUniform.value = (params.angle * Math.PI) / 180
    }

    const nextDirection = toDirectionValue(params.direction)
    if (nextDirection !== this.directionMode) {
      this.directionMode = nextDirection
      this.rebuildEffectNode()
    }
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.intensityUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))

    // Compute direction vector for the aberration offset
    let offsetDir: Node

    if (this.directionMode === DIR_RADIAL) {
      const center = vec2(
        this.centerXUniform,
        float(1).sub(this.centerYUniform)
      )
      const toPixel = vec2(
        renderTargetUv.x.sub(center.x),
        renderTargetUv.y.sub(center.y)
      )
      const dist = length(toPixel)
      // Normalize direction, scale by distance from center for radial falloff
      offsetDir = vec2(
        toPixel.x.div(dist.add(float(0.0001))).mul(dist),
        toPixel.y.div(dist.add(float(0.0001))).mul(dist)
      )
    } else if (this.directionMode === DIR_HORIZONTAL) {
      offsetDir = vec2(cos(this.angleUniform), sin(this.angleUniform))
    } else {
      offsetDir = vec2(float(0), float(1))
    }

    // Convert pixel intensity to UV space
    const scaleX = this.intensityUniform.div(this.widthUniform)
    const scaleY = this.intensityUniform.div(this.heightUniform)
    const offset = vec2(offsetDir.x.mul(scaleX), offsetDir.y.mul(scaleY))

    // Sample R, G, B at different offsets
    // Red shifts outward, green stays, blue shifts inward
    const uvR = clamp(
      vec2(renderTargetUv.x.add(offset.x), renderTargetUv.y.add(offset.y)),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )
    const uvG = renderTargetUv
    const uvB = clamp(
      vec2(renderTargetUv.x.sub(offset.x), renderTargetUv.y.sub(offset.y)),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )

    const sampleR = this.trackSourceTextureNode(uvR)
    const sampleG = this.trackSourceTextureNode(uvG)
    const sampleB = this.trackSourceTextureNode(uvB)

    return vec4(float(sampleR.r), float(sampleG.g), float(sampleB.b), float(1))
  }
}
