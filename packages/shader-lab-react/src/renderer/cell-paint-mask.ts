/** Binary coverage in centered, shorter-edge composition units. Versioned and
 * bounded so projects/history need no external assets or growing stroke lists. */
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
    for (let i = 0; i < PIXELS; i++)
      mask.data[i] = packed.charCodeAt(i >> 3) & (1 << (i & 7)) ? 255 : 0
    return mask
  } catch {
    return emptyCellPaintMask()
  }
}
export function encodeCellPaintMask(mask: CellPaintMask): string {
  const packed = new Uint8Array(BYTES)
  let any = false
  for (let i = 0; i < PIXELS; i++) {
    if (mask.data[i]) {
      packed[i >> 3] = (packed[i >> 3] ?? 0) | (1 << (i & 7))
      any = true
    }
  }
  if (!any) return ""
  let binary = ""
  for (let i = 0; i < packed.length; i += 4096)
    binary += String.fromCharCode(...packed.subarray(i, i + 4096))
  return `pc1:${mask.width}:${mask.height}:${btoa(binary)}`
}
