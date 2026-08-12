import * as THREE from "three/webgpu"
import { resolveTextFontFamily } from "@/lib/editor/text-fonts"

export const LABEL_CHARS = "0123456789xy:.,- #"
export const LABEL_CELL_ASPECT = 0.55

const CELL_HEIGHT_PX = 64
const CELL_WIDTH_PX = Math.round(CELL_HEIGHT_PX * LABEL_CELL_ASPECT)
const BLANK_GLYPH = -1

const glyphIndexByChar = new Map<string, number>(
  [...LABEL_CHARS].map((char, index) => [char, index])
)

export function glyphIndex(char: string): number {
  return glyphIndexByChar.get(char) ?? BLANK_GLYPH
}

export { BLANK_GLYPH }

export function buildLabelAtlas(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null
  }

  const canvas = document.createElement("canvas")
  canvas.width = LABEL_CHARS.length * CELL_WIDTH_PX
  canvas.height = CELL_HEIGHT_PX

  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }

  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#fff"
  context.font = `${Math.round(CELL_HEIGHT_PX * 0.72)}px ${resolveTextFontFamily("mono")}`
  context.textAlign = "center"
  context.textBaseline = "middle"

  for (const [index, char] of [...LABEL_CHARS].entries()) {
    context.fillText(
      char,
      (index + 0.5) * CELL_WIDTH_PX,
      CELL_HEIGHT_PX * 0.54
    )
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.flipY = false
  texture.generateMipmaps = false
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}
