import { emptyCellPaintMask, encodeCellPaintMask } from "@/renderer/cell-paint-mask"
import { paintCellSegment } from "@/lib/editor/paint/cell-paint-brush"

export const LEGACY_LAYOUT_DIGEST = "d463bb1b"

export function legacyParams(params) {
  const legacy = { ...params }
  delete legacy.rotationJitter
  delete legacy.alignToEdges
  delete legacy.connectedDots
  return legacy
}

export function legacyEdgeField() {
  const edges = { width: 16, height: 9, data: new Float32Array(16 * 9) }
  for (let y = 0; y < 9; y++)
    for (let x = 8; x < 16; x++) edges.data[y * 16 + x] = x === 12 && y === 4 ? 1 : 0.6
  return edges
}

export function legacyCases(base) {
  const aspect = 16 / 9
  const mask = emptyCellPaintMask(aspect, 1)
  paintCellSegment(mask, { x: 0.3, y: -0.3 }, { x: 0.6, y: -0.3 }, 0.12, false)
  const paintMask = encodeCellPaintMask(mask)
  const edges = legacyEdgeField()
  const cases = []
  for (const seed of [3, 11, 42]) {
    cases.push([{ ...base, seed, drift: 0 }, { aspect, time: 0 }])
    cases.push([{ ...base, seed }, { aspect, time: 2.5 }])
    cases.push([{ ...base, seed, drift: 0, placement: "edges" }, { aspect, time: 0, edges }])
    cases.push([{ ...base, seed, placement: "edges", targetSnap: true }, { aspect, time: 1.2, edges }])
    cases.push([{ ...base, seed, drift: 0, placement: "painted", paintMask }, { aspect, time: 0 }])
  }
  cases.push([{ ...base, density: 0, drift: 0 }, { aspect, time: 0 }])
  cases.push([{ ...base, density: 1, drift: 0.7 }, { aspect: 0.8, time: 4 }])
  cases.push([{ ...base, colorMode: "palette", scale: 1.6, strokeWidth: 3 }, { aspect, time: 0.5 }])
  cases.push([{ ...base, textPreset: "surveillance", labelList: undefined, metadataText: undefined }, { aspect: 1, time: 0 }])
  return cases
}

export function digestLayouts(layout, parse, base) {
  let hash = 2166136261
  for (const [params, context] of legacyCases(base)) {
    const text = JSON.stringify(layout(parse(params), context), (_key, value) =>
      typeof value === "number" ? Math.round(value * 1e7) / 1e7 : value
    )
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  }
  return (hash >>> 0).toString(16)
}

