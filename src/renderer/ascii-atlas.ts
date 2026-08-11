import * as THREE from "three/webgpu"
import {
  normalizeTextFontWeight,
  resolveTextFontFamily,
} from "@/lib/editor/text-fonts"
import { computeSignedDistanceField } from "@/lib/sdf/distance-transform"

export const ASCII_CHARSETS: Record<string, string> = {
  binary: "01",
  blocks: " ░▒▓█",
  boxes: " ·─│┌┐└┘├┤┬┴┼█",
  dense: " .',:;!|({#@",
  hatching: " ╱╲╳░▒",
  hex: " 0123456789ABCDEF",
  katakana: " ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾔﾕﾗﾘﾜ",
  light: " .:-=+*#%@",
  shades: " ▁▂▃▄▅▆▇█",
}

export const DEFAULT_ASCII_CHARS = " .:-=+*#%@"
export const DEFAULT_EDGE_CHARS = "|/-\\"

const CELL_INNER_HEIGHT = 64
const CELL_PADDING = 6
const SDF_RADIUS = 8
const GLYPH_FONT_SCALE = 0.8
const MIN_INK_COVERAGE = 0.0008
const MIN_CELL_ASPECT = 0.25
const MAX_CELL_ASPECT = 2
const FEATURE_SIZE = 4
const FEATURE_DIM = FEATURE_SIZE * FEATURE_SIZE
const FEATURE_TEXELS = FEATURE_DIM / 4

export type AsciiAtlas = {
  cellAspect: number
  charCount: number
  chars: string
  columns: number
  coverage: readonly number[]
  edgeStart: number
  featureTexture: THREE.DataTexture
  innerFractionX: number
  innerFractionY: number
  padFractionX: number
  padFractionY: number
  rampCount: number
  rows: number
  sdfRadius: number
  texture: THREE.DataTexture
}

export type AsciiAtlasOptions = {
  autoSort: boolean
  cellAspect: number
  chars: string
  edgeChars: string
  fontFamily: string
  fontWeight: number
}

type GlyphRaster = {
  alpha: Uint8ClampedArray
  char: string
  coverage: number
  field: Uint8ClampedArray
}

function normalizeChars(chars: string): string {
  return chars.length > 0 ? [...chars].join("") : " "
}

function getPrimaryFamily(fontFamilyList: string): string {
  const first = fontFamilyList.split(",")[0]?.trim() ?? "monospace"
  return first.length > 0 ? first : "monospace"
}

function buildFontShorthand(
  fontFamilyList: string,
  weight: number,
  fontSize: number
): string {
  return `${weight} ${fontSize}px ${fontFamilyList}`
}

function resolveFont(options: AsciiAtlasOptions): {
  fontFamilyList: string
  fontSize: number
  shorthand: string
  weight: number
} {
  // Web fonts rarely cover katakana or box-drawing glyphs; ending the list
  // with a CJK-capable system family lets Canvas2D rasterize those charsets
  // per glyph instead of drawing blanks for the coverage filter to discard.
  const fontFamilyList = `${resolveTextFontFamily(options.fontFamily)}, "Hiragino Kaku Gothic ProN", monospace`
  const weight = normalizeTextFontWeight(options.fontFamily, options.fontWeight)
  const fontSize = Math.max(4, Math.round(CELL_INNER_HEIGHT * GLYPH_FONT_SCALE))

  return {
    fontFamilyList,
    fontSize,
    shorthand: buildFontShorthand(fontFamilyList, weight, fontSize),
    weight,
  }
}

export function isAsciiFontReady(options: AsciiAtlasOptions): boolean {
  if (typeof document === "undefined" || !document.fonts) {
    return true
  }

  const { fontFamilyList, fontSize, weight } = resolveFont(options)
  const probe = buildFontShorthand(
    getPrimaryFamily(fontFamilyList),
    weight,
    fontSize
  )

  try {
    return document.fonts.check(probe)
  } catch {
    return true
  }
}

export async function loadAsciiFont(options: AsciiAtlasOptions): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return
  }

  const { fontFamilyList, fontSize, weight } = resolveFont(options)
  const probe = buildFontShorthand(
    getPrimaryFamily(fontFamilyList),
    weight,
    fontSize
  )

  try {
    await document.fonts.load(probe)
  } catch {
    return
  }
}

function createContext(
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  return canvas.getContext("2d", { willReadFrequently: true })
}

function measureLayout(
  chars: string,
  shorthand: string,
  requestedAspect: number
): { ascent: number; descent: number; innerWidth: number } {
  const context = createContext(8, 8)

  if (!context) {
    return {
      ascent: CELL_INNER_HEIGHT * 0.75,
      descent: CELL_INNER_HEIGHT * 0.25,
      innerWidth: Math.round(CELL_INNER_HEIGHT * 0.6),
    }
  }

  context.font = shorthand
  context.textAlign = "center"
  context.textBaseline = "alphabetic"

  const reference = context.measureText("Hxg")
  const ascent =
    reference.fontBoundingBoxAscent ||
    reference.actualBoundingBoxAscent ||
    CELL_INNER_HEIGHT * 0.75
  const descent =
    reference.fontBoundingBoxDescent ||
    reference.actualBoundingBoxDescent ||
    CELL_INNER_HEIGHT * 0.25

  if (requestedAspect > 0) {
    const clamped = Math.min(
      MAX_CELL_ASPECT,
      Math.max(MIN_CELL_ASPECT, requestedAspect)
    )

    return {
      ascent,
      descent,
      innerWidth: Math.max(2, Math.round(CELL_INNER_HEIGHT * clamped)),
    }
  }

  let maxAdvance = 0

  for (const char of chars) {
    maxAdvance = Math.max(maxAdvance, context.measureText(char).width)
  }

  const autoAspect = Math.min(
    MAX_CELL_ASPECT,
    Math.max(MIN_CELL_ASPECT, maxAdvance / CELL_INNER_HEIGHT)
  )

  return {
    ascent,
    descent,
    innerWidth: Math.max(2, Math.round(CELL_INNER_HEIGHT * autoAspect)),
  }
}

function buildFeatureVector(
  alpha: Uint8ClampedArray,
  pitchWidth: number,
  innerWidth: number,
  innerHeight: number
): number[] {
  const raw: number[] = []

  for (let row = 0; row < FEATURE_SIZE; row += 1) {
    for (let column = 0; column < FEATURE_SIZE; column += 1) {
      const x0 = CELL_PADDING + Math.floor((column * innerWidth) / FEATURE_SIZE)
      const x1 =
        CELL_PADDING + Math.floor(((column + 1) * innerWidth) / FEATURE_SIZE)
      const y0 = CELL_PADDING + Math.floor((row * innerHeight) / FEATURE_SIZE)
      const y1 =
        CELL_PADDING + Math.floor(((row + 1) * innerHeight) / FEATURE_SIZE)
      let total = 0
      let count = 0

      for (let y = y0; y < Math.max(y1, y0 + 1); y += 1) {
        for (let x = x0; x < Math.max(x1, x0 + 1); x += 1) {
          total += alpha[y * pitchWidth + x] ?? 0
          count += 1
        }
      }

      raw.push(count > 0 ? total / (count * 255) : 0)
    }
  }

  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length
  const centered = raw.map((value) => value - mean)
  const norm = Math.sqrt(
    centered.reduce((sum, value) => sum + value * value, 0)
  )

  return norm > 1e-5
    ? centered.map((value) => value / norm)
    : centered.map(() => 0)
}

export function buildAsciiAtlas(
  options: AsciiAtlasOptions,
  allowCharsetFallback = true
): AsciiAtlas {
  const rampChars = normalizeChars(options.chars)
  const edgeChars = normalizeChars(options.edgeChars)
  const allChars = [...rampChars, ...edgeChars]
  const { shorthand } = resolveFont(options)
  const { ascent, descent, innerWidth } = measureLayout(
    allChars.join(""),
    shorthand,
    options.cellAspect
  )

  const innerHeight = CELL_INNER_HEIGHT
  const pitchWidth = innerWidth + CELL_PADDING * 2
  const pitchHeight = innerHeight + CELL_PADDING * 2
  const glyphContext = createContext(pitchWidth, pitchHeight)

  if (!glyphContext) {
    throw new Error("Unable to create 2D context for ASCII atlas")
  }

  const baselineY = CELL_PADDING + (innerHeight + ascent - descent) * 0.5
  const rasters: GlyphRaster[] = []

  for (const char of allChars) {
    glyphContext.clearRect(0, 0, pitchWidth, pitchHeight)
    glyphContext.font = shorthand
    glyphContext.textAlign = "center"
    glyphContext.textBaseline = "alphabetic"
    glyphContext.fillStyle = "#fff"
    glyphContext.fillText(char, CELL_PADDING + innerWidth * 0.5, baselineY)

    const image = glyphContext.getImageData(0, 0, pitchWidth, pitchHeight)
    const pixelCount = pitchWidth * pitchHeight
    const alpha = new Uint8ClampedArray(pixelCount)
    let inkTotal = 0

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const value = image.data[pixel * 4 + 3] ?? 0
      alpha[pixel] = value
      inkTotal += value
    }

    rasters.push({
      alpha,
      char,
      coverage: inkTotal / (pixelCount * 255),
      field: computeSignedDistanceField(
        alpha,
        pitchWidth,
        pitchHeight,
        SDF_RADIUS
      ),
    })
  }

  const rampCount = [...rampChars].length
  const rampOrder = rasters.slice(0, rampCount)

  if (options.autoSort) {
    rampOrder.sort((left, right) => left.coverage - right.coverage)
  }

  // A font only covers the characters it actually has. Anything else
  // rasterises blank, so it would punch invisible holes in the ramp — or, for
  // a charset the font does not cover at all, render nothing whatsoever.
  const usableRamp = rampOrder.filter(
    (raster) => raster.char === " " || raster.coverage > MIN_INK_COVERAGE
  )

  if (usableRamp.length < 2 && allowCharsetFallback) {
    return buildAsciiAtlas({ ...options, chars: DEFAULT_ASCII_CHARS }, false)
  }

  const ordered = [
    ...(usableRamp.length >= 2 ? usableRamp : rampOrder),
    ...rasters.slice(rampCount),
  ]
  const resolvedRampCount =
    usableRamp.length >= 2 ? usableRamp.length : rampOrder.length
  const charCount = ordered.length
  const columns = Math.max(1, Math.ceil(Math.sqrt(charCount)))
  const rows = Math.max(1, Math.ceil(charCount / columns))
  const atlasWidth = columns * pitchWidth
  const atlasHeight = rows * pitchHeight
  const data = new Uint8Array(atlasWidth * atlasHeight * 4)
  const featureData = new Float32Array(charCount * FEATURE_TEXELS * 4)
  const coverage: number[] = []

  for (let index = 0; index < ordered.length; index += 1) {
    const raster = ordered[index]

    if (!raster) {
      continue
    }

    coverage.push(raster.coverage)

    const features = buildFeatureVector(
      raster.alpha,
      pitchWidth,
      innerWidth,
      innerHeight
    )

    for (let dim = 0; dim < FEATURE_DIM; dim += 1) {
      featureData[index * FEATURE_DIM + dim] = features[dim] ?? 0
    }

    const column = index % columns
    const row = Math.floor(index / columns)
    const originX = column * pitchWidth
    const originY = row * pitchHeight

    for (let y = 0; y < pitchHeight; y += 1) {
      for (let x = 0; x < pitchWidth; x += 1) {
        const source = y * pitchWidth + x
        const target = ((originY + y) * atlasWidth + originX + x) * 4
        data[target] = raster.field[source] ?? 0
        data[target + 1] = raster.alpha[source] ?? 0
        data[target + 2] = 0
        data[target + 3] = 255
      }
    }
  }

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  texture.colorSpace = THREE.NoColorSpace
  texture.generateMipmaps = false
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  const featureTexture = new THREE.DataTexture(
    featureData,
    FEATURE_TEXELS,
    charCount,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  featureTexture.colorSpace = THREE.NoColorSpace
  featureTexture.generateMipmaps = false
  featureTexture.magFilter = THREE.NearestFilter
  featureTexture.minFilter = THREE.NearestFilter
  featureTexture.wrapS = THREE.ClampToEdgeWrapping
  featureTexture.wrapT = THREE.ClampToEdgeWrapping
  featureTexture.needsUpdate = true

  return {
    cellAspect: innerWidth / innerHeight,
    charCount,
    chars: ordered.map((raster) => raster.char).join(""),
    columns,
    coverage,
    edgeStart: resolvedRampCount,
    featureTexture,
    innerFractionX: innerWidth / pitchWidth,
    innerFractionY: innerHeight / pitchHeight,
    padFractionX: CELL_PADDING / pitchWidth,
    padFractionY: CELL_PADDING / pitchHeight,
    rampCount: resolvedRampCount,
    rows,
    sdfRadius: SDF_RADIUS,
    texture,
  }
}
