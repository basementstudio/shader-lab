export type TextHorizontal = "left" | "center" | "right"
export type TextVertical = "top" | "center" | "bottom"
export type TextAlign = "auto" | TextHorizontal

export type TextBlockInput = {
  text: string
  fontSize: number
  letterSpacing: number
  lineHeight: number
  align: TextAlign
  rotation: number
  horizontal: TextHorizontal
  vertical: TextVertical
  pivotX: number
  pivotY: number
}

type Glyph = { char: string; x: number }
type Line = { glyphs: Glyph[]; visualLeft: number; visualRight: number }

export function resolveTextAlign(value: unknown): TextAlign {
  return value === "left" || value === "center" || value === "right"
    ? value
    : "auto"
}

export function resolveLineHeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(3, Math.max(0.5, value))
    : 1.1
}

export function resolveTextRotation(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function splitTextLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  return lines.length ? lines : [""]
}

function layoutLine(
  context: CanvasRenderingContext2D,
  text: string,
  spacing: number
): Line {
  const characters = [...text]
  const glyphs: Glyph[] = []
  let visualLeft = Number.POSITIVE_INFINITY
  let visualRight = Number.NEGATIVE_INFINITY
  let cursorX = 0
  for (const [index, char] of characters.entries()) {
    const metrics = context.measureText(char)
    const advance = metrics.width
    const glyphLeft = cursorX - Math.max(0, metrics.actualBoundingBoxLeft)
    const glyphRight =
      cursorX + Math.max(metrics.actualBoundingBoxRight, advance)
    glyphs.push({ char, x: cursorX })
    visualLeft = Math.min(visualLeft, glyphLeft)
    visualRight = Math.max(visualRight, glyphRight)
    cursorX += advance
    if (index < characters.length - 1) cursorX += spacing
  }
  if (!Number.isFinite(visualLeft)) {
    visualLeft = 0
    visualRight = 0
  }
  return { glyphs, visualLeft, visualRight }
}

export function measureTextAscentDescent(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number
): { ascent: number; descent: number } {
  const measured = context.measureText(text)
  const fallbackAscent = fontSize * 0.78
  const fallbackDescent = fontSize * 0.22
  return {
    ascent:
      Number.isFinite(measured.actualBoundingBoxAscent) &&
      measured.actualBoundingBoxAscent > 0
        ? measured.actualBoundingBoxAscent
        : fallbackAscent,
    descent:
      Number.isFinite(measured.actualBoundingBoxDescent) &&
      measured.actualBoundingBoxDescent > 0
        ? measured.actualBoundingBoxDescent
        : fallbackDescent,
  }
}

export function drawTextBlock(
  context: CanvasRenderingContext2D,
  input: TextBlockInput
): void {
  const lines = splitTextLines(input.text)
  const spacing = input.fontSize * input.letterSpacing
  const layouts = lines.map((line) => layoutLine(context, line, spacing))
  const metrics = measureTextAscentDescent(context, input.text, input.fontSize)
  const step = input.fontSize * input.lineHeight
  const blockHeight = metrics.ascent + metrics.descent + step * (lines.length - 1)
  const horizontal = input.align === "auto" ? input.horizontal : input.align

  let firstBaseline =
    input.pivotY - blockHeight * 0.5 + metrics.ascent
  if (input.vertical === "top") firstBaseline = input.pivotY + metrics.ascent
  else if (input.vertical === "bottom")
    firstBaseline = input.pivotY - metrics.descent - step * (lines.length - 1)
  if (lines.length === 1 && input.vertical === "center")
    firstBaseline = input.pivotY + (metrics.ascent - metrics.descent) * 0.5

  const rotated = input.rotation !== 0
  if (rotated) {
    context.save()
    context.translate(input.pivotX, input.pivotY)
    context.rotate((input.rotation * Math.PI) / 180)
    context.translate(-input.pivotX, -input.pivotY)
  }
  layouts.forEach((line, index) => {
    let startX = input.pivotX - (line.visualLeft + line.visualRight) * 0.5
    if (horizontal === "left") startX = input.pivotX - line.visualLeft
    else if (horizontal === "right") startX = input.pivotX - line.visualRight
    const baselineY = firstBaseline + step * index
    for (const glyph of line.glyphs)
      context.fillText(glyph.char, startX + glyph.x, baselineY)
  })
  if (rotated) context.restore()
}

export function measureTextBlock(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  letterSpacing: number,
  lineHeight: number
): { width: number; height: number } {
  const lines = splitTextLines(text)
  const spacing = fontSize * letterSpacing
  let width = 0
  for (const line of lines) {
    const layout = layoutLine(context, line, spacing)
    width = Math.max(width, layout.visualRight - layout.visualLeft)
  }
  const metrics = measureTextAscentDescent(context, text, fontSize)
  return {
    width,
    height:
      metrics.ascent + metrics.descent + fontSize * lineHeight * (lines.length - 1),
  }
}
