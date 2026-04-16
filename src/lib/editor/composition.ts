import type { CompositionAspect, SceneConfig, Size } from "@/types/editor"

export type CompositionFrame = {
  height: number
  width: number
  x: number
  y: number
}

function getCompositionAspectRatio(
  aspect: CompositionAspect,
  customWidth: number,
  customHeight: number
): number | null {
  switch (aspect) {
    case "screen":
      return null
    case "16:9":
      return 16 / 9
    case "9:16":
      return 9 / 16
    case "4:3":
      return 4 / 3
    case "3:4":
      return 3 / 4
    case "1:1":
      return 1
    case "custom":
      return customWidth / Math.max(customHeight, 1)
    default:
      return null
  }
}

export function getCenteredCropFrame(
  canvasSize: Size
,
  ratio: number | null
): CompositionFrame {
  const canvasWidth = Math.max(1, canvasSize.width)
  const canvasHeight = Math.max(1, canvasSize.height)

  if (ratio === null) {
    return {
      height: canvasHeight,
      width: canvasWidth,
      x: 0,
      y: 0,
    }
  }

  const viewportAspect = canvasWidth / canvasHeight

  if (ratio > viewportAspect) {
    const width = canvasWidth
    const height = Math.round(canvasWidth / ratio)

    return {
      height,
      width,
      x: 0,
      y: Math.round((canvasHeight - height) / 2),
    }
  }

  const width = Math.round(canvasHeight * ratio)
  const height = canvasHeight

  return {
    height,
    width,
    x: Math.round((canvasWidth - width) / 2),
    y: 0,
  }
}

export function intersectCompositionFrames(
  left: CompositionFrame,
  right: CompositionFrame
): CompositionFrame {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightEdge = Math.min(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height)

  return {
    height: Math.max(1, bottomEdge - y),
    width: Math.max(1, rightEdge - x),
    x,
    y,
  }
}

export function getCompositionFrame(
  sceneConfig: SceneConfig,
  canvasSize: Size
): CompositionFrame {
  const ratio = getCompositionAspectRatio(
    sceneConfig.compositionAspect,
    sceneConfig.compositionWidth,
    sceneConfig.compositionHeight
  )

  return getCenteredCropFrame(canvasSize, ratio)
}

export function getEffectiveCompositionSize(
  sceneConfig: SceneConfig,
  canvasSize: Size
): Size {
  const frame = getCompositionFrame(sceneConfig, canvasSize)

  return {
    height: frame.height,
    width: frame.width,
  }
}
