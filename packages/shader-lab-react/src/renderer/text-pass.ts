import {
  float,
  type TSLNode,
  texture as tslTexture,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

function resolveFontFamily(value: string): string {
  switch (value) {
    case "mono":
      return '"Geist Mono", ui-monospace, monospace'
    case "sans":
      return "Geist, Arial, sans-serif"
    case "impact":
      return 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif'
    default:
      return 'Georgia, "Times New Roman", serif'
  }
}

export class TextPass extends PassNode {
  private readonly placeholder: THREE.Texture
  private textureNode: Node
  private textTexture: THREE.CanvasTexture | null = null
  private canvas: HTMLCanvasElement | null = null
  private width = 1
  private height = 1
  private params: LayerParameterValues = {}
  private dirty = true

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.textureNode = tslTexture(
      this.placeholder,
      vec2(uv().x, float(1).sub(uv().y))
    )
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (!this.textTexture || this.dirty) {
      this.rebuildTextTexture()
    }

    this.textureNode.value = this.textTexture ?? this.placeholder
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.params = params
    this.dirty = true
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.dirty = true
  }

  override dispose(): void {
    this.textTexture?.dispose()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.textureNode) {
      return vec4(float(0), float(0), float(0), float(1))
    }

    return vec4(this.textureNode.rgb, float(1))
  }

  private rebuildTextTexture(): void {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas")
    }

    const canvas = this.canvas
    canvas.width = this.width
    canvas.height = this.height
    const context = canvas.getContext("2d")

    if (!context) {
      return
    }

    const text =
      typeof this.params.text === "string" && this.params.text.length > 0
        ? this.params.text
        : "basement.studio"
    const fontSize =
      typeof this.params.fontSize === "number"
        ? Math.max(48, this.params.fontSize)
        : 280
    const fontWeight =
      typeof this.params.fontWeight === "number"
        ? Math.round(this.params.fontWeight)
        : 700
    const letterSpacing =
      typeof this.params.letterSpacing === "number"
        ? this.params.letterSpacing
        : -0.02
    const fontFamily = resolveFontFamily(
      typeof this.params.fontFamily === "string"
        ? this.params.fontFamily
        : "display-serif"
    )
    const textColor =
      typeof this.params.textColor === "string"
        ? this.params.textColor
        : "#ffffff"
    const backgroundColor =
      typeof this.params.backgroundColor === "string"
        ? this.params.backgroundColor
        : "#000000"

    context.clearRect(0, 0, this.width, this.height)
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, this.width, this.height)
    context.fillStyle = textColor
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`

    const characters = [...text]
    const spacing = fontSize * letterSpacing
    let totalWidth = 0

    for (const [index, char] of characters.entries()) {
      totalWidth += context.measureText(char).width
      if (index < characters.length - 1) {
        totalWidth += spacing
      }
    }

    let x = this.width * 0.5 - totalWidth * 0.5
    const y = this.height * 0.5

    for (const char of characters) {
      const charWidth = context.measureText(char).width
      context.fillText(char, x + charWidth * 0.5, y)
      x += charWidth + spacing
    }

    if (!this.textTexture) {
      this.textTexture = new THREE.CanvasTexture(canvas)
      this.textTexture.flipY = false
      this.textTexture.generateMipmaps = false
      this.textTexture.magFilter = THREE.LinearFilter
      this.textTexture.minFilter = THREE.LinearFilter
      this.textTexture.wrapS = THREE.ClampToEdgeWrapping
      this.textTexture.wrapT = THREE.ClampToEdgeWrapping
      this.textTexture.colorSpace = THREE.SRGBColorSpace
    } else {
      this.textTexture.image = canvas
    }

    this.textTexture.needsUpdate = true
    this.dirty = false
  }
}
