import type { LayerParameterValues, Size, TextAnchor } from "@/types/editor"

export type TextPlacement = {
  horizontal: "left" | "center" | "right"
  vertical: "top" | "center" | "bottom"
}

export function textAnchorPlacement(value: unknown): TextPlacement {
  const anchor = (typeof value === "string" ? value : "center") as TextAnchor
  const [vertical, horizontal] = anchor.includes("-")
    ? (anchor.split("-") as [TextPlacement["vertical"], TextPlacement["horizontal"]])
    : (["center", "center"] as const)
  return {
    horizontal: horizontal === "left" || horizontal === "right" ? horizontal : "center",
    vertical: vertical === "top" || vertical === "bottom" ? vertical : "center",
  }
}

export function textOffset(value: unknown): [number, number] {
  return Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : [0, 0]
}

function axisPosition(
  placement: "left" | "center" | "right" | "top" | "bottom",
  extent: number
): number {
  if (placement === "left" || placement === "top") return 0
  if (placement === "right" || placement === "bottom") return extent
  return extent / 2
}

function anchorPoint(placement: TextPlacement, logical: Size): [number, number] {
  return [
    axisPosition(placement.horizontal, logical.width),
    axisPosition(placement.vertical, logical.height),
  ]
}

/** Pivot in logical pixels: the anchor point moved by the offset (offset y is up). */
export function textPivotPx(params: LayerParameterValues, logical: Size): [number, number] {
  const placement = textAnchorPlacement(params.anchor)
  const [ax, ay] = anchorPoint(placement, logical)
  const [ox, oy] = textOffset(params.offset)
  return [ax + ox * logical.width, ay - oy * logical.height]
}

export function textPivotUnits(params: LayerParameterValues, logical: Size): [number, number] {
  const shorter = Math.max(1, Math.min(logical.width, logical.height))
  const [px, py] = textPivotPx(params, logical)
  return [(px - logical.width / 2) / shorter, (py - logical.height / 2) / shorter]
}

export function offsetFromPivotUnits(
  params: LayerParameterValues,
  logical: Size,
  units: [number, number]
): [number, number] {
  const shorter = Math.max(1, Math.min(logical.width, logical.height))
  const placement = textAnchorPlacement(params.anchor)
  const [ax, ay] = anchorPoint(placement, logical)
  const px = units[0] * shorter + logical.width / 2
  const py = units[1] * shorter + logical.height / 2
  return [
    Math.round(((px - ax) / logical.width) * 10000) / 10000,
    Math.round((-(py - ay) / logical.height) * 10000) / 10000,
  ]
}

export function textFontSize(params: LayerParameterValues): number {
  return typeof params.fontSize === "number" ? Math.max(4, params.fontSize) : 48
}
