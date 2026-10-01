import {
  CELL_PAINT_SIZE,
  type CellPaintMask,
  emptyCellPaintMask,
} from "@/renderer/cell-paint-mask"
export type PaintPoint = { x: number; y: number }

/** Keep authored coverage anchored to the cell grid when the viewport changes. */
export function expandCellPaintMask(
  mask: CellPaintMask,
  viewportWidth: number,
  viewportHeight: number
): CellPaintMask {
  const width = Math.max(mask.width, Math.min(100, viewportWidth))
  const height = Math.max(mask.height, Math.min(100, viewportHeight))
  if (width === mask.width && height === mask.height) return mask
  const next = emptyCellPaintMask(width, height)
  const n = CELL_PAINT_SIZE
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx = Math.floor(
        ((((x + 0.5) / n - 0.5) * width) / mask.width) * n + n / 2
      )
      const sy = Math.floor(
        ((((y + 0.5) / n - 0.5) * height) / mask.height) * n + n / 2
      )
      if (sx >= 0 && sx < n && sy >= 0 && sy < n)
        next.data[y * n + x] = mask.data[sy * n + sx] ?? 0
    }
  return next
}

/** Rasterize a capsule, not isolated stamps: fast pointer motion leaves no holes.
 * Only the stroke bounds are visited; no work is done during video playback. */
export function paintCellSegment(
  mask: CellPaintMask,
  from: PaintPoint,
  to: PaintPoint,
  radius: number,
  erase: boolean
): void {
  const n = CELL_PAINT_SIZE
  const x0 = Math.max(
    0,
    Math.floor(((Math.min(from.x, to.x) - radius) / mask.width) * n + n / 2)
  )
  const x1 = Math.min(
    n - 1,
    Math.ceil(((Math.max(from.x, to.x) + radius) / mask.width) * n + n / 2)
  )
  const y0 = Math.max(
    0,
    Math.floor(((Math.min(from.y, to.y) - radius) / mask.height) * n + n / 2)
  )
  const y1 = Math.min(
    n - 1,
    Math.ceil(((Math.max(from.y, to.y) + radius) / mask.height) * n + n / 2)
  )
  const dx = to.x - from.x
  const dy = to.y - from.y
  const squared = dx * dx + dy * dy
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = ((x + 0.5) / n - 0.5) * mask.width - from.x
      const py = ((y + 0.5) / n - 0.5) * mask.height - from.y
      const t = squared
        ? Math.max(0, Math.min(1, (px * dx + py * dy) / squared))
        : 0
      if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= radius * radius)
        mask.data[y * n + x] = erase ? 0 : 255
    }
}
