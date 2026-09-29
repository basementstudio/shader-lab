export const CELL_PAINT_SIZE = 512
const PIXELS = CELL_PAINT_SIZE * CELL_PAINT_SIZE
const BYTES = PIXELS / 8
export type CellPaintMask = { data: Uint8Array; width: number; height: number }
export function emptyCellPaintMask(width = 1, height = 1): CellPaintMask {
  return { data: new Uint8Array(PIXELS), width, height }
}
export function decodeCellPaintMask(value: unknown): CellPaintMask {
  if (typeof value !== "string" || value.length > 44000)
    return emptyCellPaintMask()
  const parts = value.split(":")
  const width = Number(parts[1])
  const height = Number(parts[2])
  if (
    parts.length !== 4 ||
    parts[0] !== "pc1" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 100 ||
    height > 100 ||
    (parts[3] ?? "").length !== Math.ceil(BYTES / 3) * 4
  )
    return emptyCellPaintMask()
  try {
    const packed = atob(parts[3] ?? "")
    if (packed.length !== BYTES) return emptyCellPaintMask()
    const mask = emptyCellPaintMask(width, height)
    const data = mask.data
    for (let byte = 0; byte < BYTES; byte++) {
      const bits = packed.charCodeAt(byte)
      if (bits === 0) continue
      const start = byte << 3
      for (let bit = 0; bit < 8; bit++)
        if (bits & (1 << bit)) data[start + bit] = 255
    }
    return mask
  } catch {
    return emptyCellPaintMask()
  }
}
export function encodeCellPaintMask(mask: CellPaintMask): string {
  const packed = new Uint8Array(BYTES)
  const data = mask.data
  let any = false
  for (let byte = 0; byte < BYTES; byte++) {
    const start = byte << 3
    let bits = 0
    for (let bit = 0; bit < 8; bit++) if (data[start + bit]) bits |= 1 << bit
    if (bits) {
      packed[byte] = bits
      any = true
    }
  }
  if (!any) return ""
  let binary = ""
  for (let i = 0; i < packed.length; i += 4096)
    binary += String.fromCharCode(...packed.subarray(i, i + 4096))
  return `pc1:${mask.width}:${mask.height}:${btoa(binary)}`
}
