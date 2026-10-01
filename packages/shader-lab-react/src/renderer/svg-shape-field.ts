import * as THREE from "three/webgpu"
import { applySvgPalette, readSvgAspect, type SvgPalette } from "./svg-palette"

export const SVG_FIELD_LONG_SIDE = 1024
export const SVG_FIELD_PADDING = 48
const FAR = 1e20

export type SvgShapeField = {
  color: THREE.DataTexture
  contentHeight: number
  contentWidth: number
  distance: THREE.DataTexture
  height: number
  nearest: Int32Array
  source: string
  width: number
}

function withRasterSize(text: string, width: number, height: number): string {
  return text.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const hasViewBox = /\bviewBox\s*=/.test(attributes)
    const originalWidth = Number.parseFloat(attributes.match(/\bwidth\s*=\s*["']([\d.]+)/)?.[1] ?? "")
    const originalHeight = Number.parseFloat(attributes.match(/\bheight\s*=\s*["']([\d.]+)/)?.[1] ?? "")
    const viewBox =
      !hasViewBox && originalWidth > 0 && originalHeight > 0
        ? ` viewBox="0 0 ${originalWidth} ${originalHeight}"`
        : ""
    const stripped = attributes
      .replace(/\s(width|height|preserveAspectRatio)\s*=\s*(["'])[^"']*\2/g, "")
      .replace(/\/\s*$/, "")
    return `<svg${stripped}${viewBox} width="${width}" height="${height}" preserveAspectRatio="none">`
  })
}

function loadSvgImage(text: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }))
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The SVG could not be drawn"))
    image.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function transform1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  arg: Int32Array,
  v: Int32Array,
  z: Float64Array
): void {
  let k = 0
  v[0] = 0
  z[0] = -FAR
  z[1] = FAR
  for (let q = 1; q < n; q += 1) {
    let s =
      (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k -= 1
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = FAR
  }
  k = 0
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1]! < q) k += 1
    const dq = q - v[k]!
    d[q] = dq * dq + f[v[k]!]!
    arg[q] = v[k]!
  }
}

function distanceTransform(
  seeds: Uint8Array,
  width: number,
  height: number
): { distance: Float64Array; nearest: Int32Array } {
  const size = Math.max(width, height)
  const f = new Float64Array(size)
  const d = new Float64Array(size)
  const arg = new Int32Array(size)
  const v = new Int32Array(size)
  const z = new Float64Array(size + 1)
  const columnDistance = new Float64Array(width * height)
  const columnRow = new Int32Array(width * height)
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = seeds[y * width + x] ? 0 : FAR
    transform1d(f, height, d, arg, v, z)
    for (let y = 0; y < height; y += 1) {
      columnDistance[y * width + x] = d[y]!
      columnRow[y * width + x] = arg[y]!
    }
  }
  const distance = new Float64Array(width * height)
  const nearest = new Int32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) f[x] = columnDistance[row + x]!
    transform1d(f, width, d, arg, v, z)
    for (let x = 0; x < width; x += 1) {
      const sourceX = arg[x]!
      distance[row + x] = Math.sqrt(d[x]!)
      nearest[row + x] = columnRow[row + sourceX]! * width + sourceX
    }
  }
  return { distance, nearest }
}

function configure(texture: THREE.DataTexture): void {
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
}

function analyzeAlpha(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): { coverage: Float32Array; opacity: Uint8Array } {
  const coverage = new Float32Array(width * height)
  const opacity = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const own = pixels[index * 4 + 3] ?? 0
      if (own === 0) continue
      if (own === 255) {
        coverage[index] = 1
        opacity[index] = 255
        continue
      }
      let min = 255
      let max = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const alpha =
            nx < 0 || ny < 0 || nx >= width || ny >= height
              ? 0
              : (pixels[(ny * width + nx) * 4 + 3] ?? 0)
          if (alpha < min) min = alpha
          if (alpha > max) max = alpha
        }
      }
      if (min > 0) {
        coverage[index] = 1
        opacity[index] = own
      } else {
        coverage[index] = Math.min(1, own / max)
        opacity[index] = max
      }
    }
  }
  return { coverage, opacity }
}

function buildDistance(
  coverageMap: Float32Array,
  width: number,
  height: number
): { distance: THREE.DataTexture; nearest: Int32Array } {
  const count = width * height
  const inside = new Uint8Array(count)
  const outside = new Uint8Array(count)
  for (let index = 0; index < count; index += 1) {
    const covered = (coverageMap[index] ?? 0) >= 0.5
    inside[index] = covered ? 1 : 0
    outside[index] = covered ? 0 : 1
  }
  const toInside = distanceTransform(inside, width, height)
  const toOutside = distanceTransform(outside, width, height)
  const distances = new Uint16Array(count)
  const nearest = new Int32Array(count)
  for (let index = 0; index < count; index += 1) {
    const alpha = coverageMap[index] ?? 0
    let signed = inside[index]
      ? -(toOutside.distance[index]! - 0.5)
      : toInside.distance[index]! - 0.5
    if (alpha > 0 && alpha < 1 && Math.abs(signed) <= 1) signed = 0.5 - alpha
    distances[index] = THREE.DataUtils.toHalfFloat(Math.max(-2048, Math.min(2048, signed)))
    nearest[index] = inside[index] ? index : toInside.nearest[index]!
  }
  const distance = new THREE.DataTexture(
    distances,
    width,
    height,
    THREE.RedFormat,
    THREE.HalfFloatType
  )
  configure(distance)
  return { distance, nearest }
}

export async function buildSvgShapeField(
  text: string,
  palette: SvgPalette,
  reuse: SvgShapeField | null = null
): Promise<SvgShapeField> {
  const aspect = readSvgAspect(text)
  const contentWidth = Math.max(
    8,
    Math.round(aspect >= 1 ? SVG_FIELD_LONG_SIDE : SVG_FIELD_LONG_SIDE * aspect)
  )
  const contentHeight = Math.max(
    8,
    Math.round(aspect >= 1 ? SVG_FIELD_LONG_SIDE / aspect : SVG_FIELD_LONG_SIDE)
  )
  const image = await loadSvgImage(
    withRasterSize(applySvgPalette(text, palette), contentWidth, contentHeight)
  )
  const width = contentWidth + SVG_FIELD_PADDING * 2
  const height = contentHeight + SVG_FIELD_PADDING * 2
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Unable to create a 2D context for the SVG")
  context.clearRect(0, 0, width, height)
  context.drawImage(
    image,
    SVG_FIELD_PADDING,
    SVG_FIELD_PADDING,
    contentWidth,
    contentHeight
  )
  const pixels = context.getImageData(0, 0, width, height).data
  const count = width * height
  const { coverage, opacity } = analyzeAlpha(pixels, width, height)
  const geometry =
    reuse && reuse.source === text && reuse.width === width && reuse.height === height
      ? { distance: reuse.distance, nearest: reuse.nearest }
      : buildDistance(coverage, width, height)
  const colors = new Uint8Array(count * 4)
  for (let index = 0; index < count; index += 1) {
    const source = geometry.nearest[index]!
    colors[index * 4] = pixels[source * 4] ?? 0
    colors[index * 4 + 1] = pixels[source * 4 + 1] ?? 0
    colors[index * 4 + 2] = pixels[source * 4 + 2] ?? 0
    colors[index * 4 + 3] = opacity[source] ?? 255
  }
  const color = new THREE.DataTexture(colors, width, height, THREE.RGBAFormat)
  color.colorSpace = THREE.SRGBColorSpace
  configure(color)
  return {
    color,
    contentHeight,
    contentWidth,
    distance: geometry.distance,
    height,
    nearest: geometry.nearest,
    source: text,
    width,
  }
}
