export const MAX_SVG_PALETTE_COLORS = 12
export const IMPLICIT_SVG_FILL = "#000000"

export type SvgPalette = Record<string, string>

const COLOR_ATTRIBUTE =
  /\b(fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*(["'])([^"']*)\2/gi
const COLOR_PROPERTY =
  /\b(fill|stroke|stop-color|flood-color|lighting-color)\s*:\s*([^;"'}<>]+)/gi
const DRAWABLE_NAMES = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
])
const ANY_TAG = /<(\/?)([a-z][\w:.-]*)\b([^>]*)>/gi
const ROOT_TAG = /<svg\b([^>]*)>/i
const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/

function withAlpha(hex: string, alpha: number): string | null {
  if (alpha <= 0) return null
  if (alpha >= 1) return hex
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`
}

let probe: CanvasRenderingContext2D | null | undefined

function probeContext(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe
  probe =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d")
  return probe
}

export function normalizeSvgColor(value: string): string | null {
  const raw = value.trim().toLowerCase()
  if (
    raw === "" ||
    raw === "none" ||
    raw === "transparent" ||
    raw === "currentcolor" ||
    raw === "inherit" ||
    raw.startsWith("url(")
  ) {
    return null
  }
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  }
  if (/^#[0-9a-f]{4}$/.test(raw)) {
    const hex = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
    return withAlpha(hex, Number.parseInt(`${raw[4]}${raw[4]}`, 16) / 255)
  }
  if (/^#[0-9a-f]{8}$/.test(raw)) {
    return withAlpha(raw.slice(0, 7), Number.parseInt(raw.slice(7), 16) / 255)
  }
  if (HEX_COLOR.test(raw)) return raw
  const context = probeContext()
  if (!context) return null
  context.fillStyle = "#010203"
  context.fillStyle = raw
  const resolved = String(context.fillStyle).toLowerCase()
  if (HEX_COLOR.test(resolved)) {
    return resolved === "#010203" && raw !== "#010203" ? null : resolved
  }
  const rgba = resolved.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/
  )
  if (!rgba) return null
  const hex = `#${[rgba[1], rgba[2], rgba[3]]
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`
  return withAlpha(hex, rgba[4] === undefined ? 1 : Number(rgba[4]))
}

function hasOwnFill(attributes: string): boolean {
  return /\bfill\s*=/.test(attributes) || /\bfill\s*:/.test(attributes)
}

function usesImplicitFill(text: string): boolean {
  if (/<style\b[^>]*>[\s\S]*?\bfill\s*:/i.test(text)) return false
  const stack: boolean[] = []
  let filledAncestors = 0
  for (const match of text.replace(/<!--[\s\S]*?-->/g, "").matchAll(ANY_TAG)) {
    const name = (match[2] ?? "").toLowerCase()
    const attributes = match[3] ?? ""
    if (match[1]) {
      if (stack.length > 0 && stack.pop()) filledAncestors -= 1
      continue
    }
    const own = hasOwnFill(attributes)
    if (DRAWABLE_NAMES.has(name) && !own && filledAncestors === 0) return true
    if (!attributes.trimEnd().endsWith("/")) {
      stack.push(own)
      if (own) filledAncestors += 1
    }
  }
  return false
}

export function extractSvgColors(text: string): string[] {
  const colors: string[] = []
  const add = (value: string) => {
    const color = normalizeSvgColor(value)
    if (color && !colors.includes(color) && colors.length < MAX_SVG_PALETTE_COLORS) {
      colors.push(color)
    }
  }
  for (const match of text.matchAll(COLOR_ATTRIBUTE)) add(match[3] ?? "")
  for (const match of text.matchAll(COLOR_PROPERTY)) add(match[2] ?? "")
  if (usesImplicitFill(text)) add(IMPLICIT_SVG_FILL)
  return colors
}

export function parseSvgPalette(value: unknown): SvgPalette {
  if (typeof value !== "string" || value === "") return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const palette: SvgPalette = {}
    for (const [from, to] of Object.entries(parsed as Record<string, unknown>)) {
      const source = normalizeSvgColor(from)
      const target = typeof to === "string" ? normalizeSvgColor(to) : null
      if (source && target && source !== target) palette[source] = target
    }
    return palette
  } catch {
    return {}
  }
}

export function serializeSvgPalette(palette: SvgPalette): string {
  const entries = Object.entries(palette)
    .filter(([from, to]) => from !== to)
    .sort(([a], [b]) => a.localeCompare(b))
  return entries.length === 0 ? "" : JSON.stringify(Object.fromEntries(entries))
}

export function applySvgPalette(text: string, palette: SvgPalette): string {
  if (Object.keys(palette).length === 0) return text
  const swap = (value: string) => {
    const color = normalizeSvgColor(value)
    const target = color ? palette[color] : undefined
    if (!color || !target) return value
    return color.length === 9 && target.length === 7
      ? `${target}${color.slice(7)}`
      : target
  }
  let next = text
    .replace(
      COLOR_ATTRIBUTE,
      (_match, name: string, quote: string, value: string) =>
        `${name}=${quote}${swap(value)}${quote}`
    )
    .replace(
      COLOR_PROPERTY,
      (_match, name: string, value: string) => `${name}:${swap(value)}`
    )
  const implicit = palette[IMPLICIT_SVG_FILL]
  if (implicit && usesImplicitFill(text)) {
    next = next.replace(ROOT_TAG, (_match, attributes: string) => `<svg${attributes} fill="${implicit}">`)
  }
  return next
}

export function readSvgAspect(text: string): number {
  const viewBox = text.match(/\bviewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)/)
  if (viewBox) {
    const width = Number(viewBox[3])
    const height = Number(viewBox[4])
    if (width > 0 && height > 0) return width / height
  }
  const root = text.match(/<svg\b([^>]*)>/i)?.[1] ?? ""
  const width = Number.parseFloat(root.match(/\bwidth\s*=\s*["']([\d.]+)/)?.[1] ?? "")
  const height = Number.parseFloat(root.match(/\bheight\s*=\s*["']([\d.]+)/)?.[1] ?? "")
  return width > 0 && height > 0 ? width / height : 1
}
