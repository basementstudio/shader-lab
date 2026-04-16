import {
  float,
  type TSLNode,
  texture as tslTexture,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { LayerParameterValues } from "../types/editor"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import { normalizeTextFontWeight, resolveTextFontFamily } from "./text-fonts"

type Node = TSLNode
type TextAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
type HorizontalAnchor = "left" | "center" | "right"
type VerticalAnchor = "top" | "center" | "bottom"

type TextMetrics = {
  ascent: number
  descent: number
}

type GlyphLayout = {
  advance: number
  char: string
  x: number
}

function resolveTextAnchor(value: unknown): TextAnchor {
  switch (value) {
    case "top-left":
    case "top-center":
    case "top-right":
    case "center-left":
    case "center":
    case "center-right":
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return value
    default:
      return "center"
  }
}

function resolveOffset(value: unknown): [number, number] {
  return Array.isArray(value) && value.length === 2
    ? [value[0] ?? 0, value[1] ?? 0]
    : [0, 0]
}

function getAnchorPlacement(anchor: TextAnchor): {
  horizontal: HorizontalAnchor
  vertical: VerticalAnchor
} {
  switch (anchor) {
    case "top-left":
      return { horizontal: "left", vertical: "top" }
    case "top-center":
      return { horizontal: "center", vertical: "top" }
    case "top-right":
      return { horizontal: "right", vertical: "top" }
    case "center-left":
      return { horizontal: "left", vertical: "center" }
    case "center-right":
      return { horizontal: "right", vertical: "center" }
    case "bottom-left":
      return { horizontal: "left", vertical: "bottom" }
    case "bottom-center":
      return { horizontal: "center", vertical: "bottom" }
    case "bottom-right":
      return { horizontal: "right", vertical: "bottom" }
    default:
      return { horizontal: "center", vertical: "center" }
  }
}

function getTextMetrics(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number
): TextMetrics {
  const measured = context.measureText(text)
  const fallbackAscent = fontSize * 0.78
  const fallbackDescent = fontSize * 0.22

  return {
    ascent:
      measured.actualBoundingBoxAscent > 0
        ? measured.actualBoundingBoxAscent
        : fallbackAscent,
    descent:
      measured.actualBoundingBoxDescent > 0
        ? measured.actualBoundingBoxDescent
        : fallbackDescent,
  }
}

export class TextPass extends PassNode {
  private readonly placeholder: THREE.Texture
  private textureNode: Node
  private textTexture: THREE.CanvasTexture | null = null
  private canvas: HTMLCanvasElement | null = null
  private width = 1
  private height = 1
  private logicalWidth = 1
  private logicalHeight = 1
  private params: LayerParameterValues = {}
  private dirty = true

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
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

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.dirty = true
  }

  override dispose(): void {
    this.textTexture?.dispose()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.textureNode) {
      return vec4(float(0), float(0), float(0), float(0))
    }

    return vec4(this.textureNode.rgb, this.textureNode.a)
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
    const scaleFactor = Math.min(
      this.width / this.logicalWidth,
      this.height / this.logicalHeight
    )
    const baseFontSize =
      typeof this.params.fontSize === "number"
        ? Math.max(48, this.params.fontSize)
        : 280
    const fontSize = Math.round(baseFontSize * scaleFactor)
    const fontFamilyValue =
      typeof this.params.fontFamily === "string"
        ? this.params.fontFamily
        : "display-serif"
    const fontWeight =
      typeof this.params.fontWeight === "number" ? this.params.fontWeight : 700
    const letterSpacing =
      typeof this.params.letterSpacing === "number"
        ? this.params.letterSpacing
        : -0.02
    const fontFamily = resolveTextFontFamily(fontFamilyValue)
    const normalizedFontWeight = normalizeTextFontWeight(
      fontFamilyValue,
      fontWeight
    )
    const textColor =
      typeof this.params.textColor === "string"
        ? this.params.textColor
        : "#ffffff"
    const backgroundColor =
      typeof this.params.backgroundColor === "string"
        ? this.params.backgroundColor
        : "#000000"
    const backgroundAlpha =
      typeof this.params.backgroundAlpha === "number"
        ? Math.max(0, Math.min(1, this.params.backgroundAlpha))
        : 1
    const anchor = resolveTextAnchor(this.params.anchor)
    const offset = resolveOffset(this.params.offset)
    const { horizontal, vertical } = getAnchorPlacement(anchor)

    context.clearRect(0, 0, this.width, this.height)
    context.fillStyle = backgroundColor
    context.globalAlpha = backgroundAlpha
    context.fillRect(0, 0, this.width, this.height)
    context.globalAlpha = 1
    context.fillStyle = textColor
    context.textAlign = "left"
    context.textBaseline = "alphabetic"
    context.font = `${normalizedFontWeight} ${fontSize}px ${fontFamily}`

    const characters = [...text]
    const spacing = fontSize * letterSpacing
    const glyphLayout: GlyphLayout[] = []
    let visualLeft = Number.POSITIVE_INFINITY
    let visualRight = Number.NEGATIVE_INFINITY
    let cursorX = 0

    for (const [index, char] of characters.entries()) {
      const metrics = context.measureText(char)
      const advance = metrics.width
      const glyphLeft = cursorX - Math.max(0, metrics.actualBoundingBoxLeft)
      const glyphRight =
        cursorX + Math.max(metrics.actualBoundingBoxRight, advance)

      glyphLayout.push({
        advance,
        char,
        x: cursorX,
      })
      visualLeft = Math.min(visualLeft, glyphLeft)
      visualRight = Math.max(visualRight, glyphRight)
      cursorX += advance

      if (index < characters.length - 1) {
        cursorX += spacing
      }
    }

    if (!Number.isFinite(visualLeft)) {
      visualLeft = 0
      visualRight = 0
    }

    const metrics = getTextMetrics(context, text, fontSize)
    let anchorX = this.width * 0.5
    if (horizontal === "left") {
      anchorX = 0
    } else if (horizontal === "right") {
      anchorX = this.width
    }

    let anchorY = this.height * 0.5
    if (vertical === "top") {
      anchorY = 0
    } else if (vertical === "bottom") {
      anchorY = this.height
    }

    const offsetX = offset[0] * this.width
    const offsetY = offset[1] * this.height

    let startX = anchorX + offsetX - (visualLeft + visualRight) * 0.5
    if (horizontal === "left") {
      startX = anchorX + offsetX - visualLeft
    } else if (horizontal === "right") {
      startX = anchorX + offsetX - visualRight
    }

    let baselineY = anchorY - offsetY + (metrics.ascent - metrics.descent) * 0.5
    if (vertical === "top") {
      baselineY = anchorY - offsetY + metrics.ascent
    } else if (vertical === "bottom") {
      baselineY = anchorY - offsetY - metrics.descent
    }

    for (const glyph of glyphLayout) {
      context.fillText(glyph.char, startX + glyph.x, baselineY)
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
