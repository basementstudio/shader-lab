import * as THREE from "three/webgpu"

export const ASCII_CHARSETS: Record<string, string> = {
  binary: "01",
  blocks: " ░▒▓█",
  dense: " .',:;!|({#@",
  hatching: " ╱╲╳░▒",
  light: " .:-=+*#%@",
}

export type AsciiFontWeight = "thin" | "regular" | "bold"
export const DEFAULT_ASCII_CHARS = " .:-=+*#%@"

function normalizeChars(chars: string): string {
  return chars.length > 0 ? chars : " "
}

export function buildAsciiAtlas(
  chars: string,
  fontWeight: AsciiFontWeight = "regular",
  cellPx = 16,
): THREE.CanvasTexture {
  const normalizedChars = normalizeChars(chars)
  const cellSize = Math.max(4, Math.round(cellPx))
  const fontSize = Math.max(4, Math.floor(cellSize * 0.9))
  const canvas = document.createElement("canvas")
  canvas.width = normalizedChars.length * cellSize
  canvas.height = cellSize

  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Unable to create 2D context for ASCII atlas")
  }

  context.imageSmoothingEnabled = false
  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)

  const weightMap: Record<AsciiFontWeight, string> = {
    bold: "700",
    regular: "400",
    thin: "100",
  }

  context.fillStyle = "#fff"
  context.font = `${weightMap[fontWeight]} ${fontSize}px "Geist Mono", monospace`
  context.textAlign = "center"
  context.textBaseline = "alphabetic"

  for (const [index, char] of [...normalizedChars].entries()) {
    const metrics = context.measureText(char)
    const x = Math.round((index + 0.5) * cellSize)
    const y = Math.round(
      (cellSize + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) * 0.5,
    )
    context.fillText(char, x, y)
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image

  for (let index = 0; index < data.length; index += 4) {
    const mask = (data[index] ?? 0) > 96 ? 255 : 0
    data[index] = mask
    data[index + 1] = mask
    data[index + 2] = mask
    data[index + 3] = 255
  }

  context.putImageData(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false
  texture.generateMipmaps = false
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}
