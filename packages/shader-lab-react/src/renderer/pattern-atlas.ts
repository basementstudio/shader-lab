import * as THREE from "three/webgpu"

export const PATTERN_PRESET_SOURCES = {
  bars: [
    new URL("../../../assets/patterns/bars/1.svg", import.meta.url).toString(),
    new URL("../../../assets/patterns/bars/2.svg", import.meta.url).toString(),
    new URL("../../../assets/patterns/bars/3.svg", import.meta.url).toString(),
    new URL("../../../assets/patterns/bars/4.svg", import.meta.url).toString(),
    new URL("../../../assets/patterns/bars/5.svg", import.meta.url).toString(),
    new URL("../../../assets/patterns/bars/6.svg", import.meta.url).toString(),
  ],
  candles: [
    new URL(
      "../../../assets/patterns/candles/1.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/candles/2.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/candles/3.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/candles/4.svg",
      import.meta.url
    ).toString(),
  ],
  shapes: [
    new URL(
      "../../../assets/patterns/shapes/1.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/shapes/2.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/shapes/3.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/shapes/4.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/shapes/5.svg",
      import.meta.url
    ).toString(),
    new URL(
      "../../../assets/patterns/shapes/6.svg",
      import.meta.url
    ).toString(),
  ],
} as const

export type PatternPreset = keyof typeof PATTERN_PRESET_SOURCES

function loadSvg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error(`Unable to load SVG pattern: ${url}`))
    image.src = url
  })
}

export async function buildPatternAtlas(
  preset: PatternPreset,
  cellPx = 16
): Promise<THREE.CanvasTexture> {
  const urls = PATTERN_PRESET_SOURCES[preset]
  const cellSize = Math.max(4, Math.round(cellPx))
  const images = await Promise.all(urls.map((url) => loadSvg(url)))
  const canvas = document.createElement("canvas")
  canvas.width = urls.length * cellSize
  canvas.height = cellSize

  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Unable to create 2D context for pattern atlas")
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#000"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true

  for (const [index, image] of images.entries()) {
    const aspect = image.naturalWidth / Math.max(image.naturalHeight, 1)
    const drawWidth = aspect >= 1 ? cellSize : cellSize * aspect
    const drawHeight =
      aspect >= 1 ? cellSize / Math.max(aspect, 0.0001) : cellSize
    const x = index * cellSize + (cellSize - drawWidth) * 0.5
    const y = (cellSize - drawHeight) * 0.5

    context.drawImage(image, x, y, drawWidth, drawHeight)
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0
    const luminance = Math.max(
      data[index] ?? 0,
      data[index + 1] ?? 0,
      data[index + 2] ?? 0
    )
    const mask = alpha > 0 && luminance > 32 ? 255 : 0
    data[index] = mask
    data[index + 1] = mask
    data[index + 2] = mask
    data[index + 3] = 255
  }

  context.putImageData(imageData, 0, 0)

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
