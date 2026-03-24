import type { Vector2 } from "@/types/editor"

export const ZOOM_MIN = 0.125
export const ZOOM_MAX = 6
export const ZOOM_PRESET_STEPS = [0.125, 0.25, 0.5, 1, 2, 4, 6] as const

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1
  }

  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

export function getNextZoomStep(currentZoom: number, direction: "in" | "out"): number {
  const normalizedCurrent = clampZoom(currentZoom)

  if (direction === "in") {
    return (
      ZOOM_PRESET_STEPS.find((step) => step > normalizedCurrent + 0.001) ?? ZOOM_MAX
    )
  }

  const reversedSteps = [...ZOOM_PRESET_STEPS].reverse()
  return reversedSteps.find((step) => step < normalizedCurrent - 0.001) ?? ZOOM_MIN
}

export function getWheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015)
}

export function applyZoomAtPoint(
  zoom: number,
  panOffset: Vector2,
  pointer: Vector2,
  nextZoomInput: number,
): { panOffset: Vector2; zoom: number } {
  const currentZoom = clampZoom(zoom)
  const nextZoom = clampZoom(nextZoomInput)

  if (Math.abs(nextZoom - currentZoom) < 0.0001) {
    return {
      panOffset,
      zoom: currentZoom,
    }
  }

  const contentX = (pointer.x - panOffset.x) / currentZoom
  const contentY = (pointer.y - panOffset.y) / currentZoom

  return {
    panOffset: {
      x: pointer.x - contentX * nextZoom,
      y: pointer.y - contentY * nextZoom,
    },
    zoom: nextZoom,
  }
}
