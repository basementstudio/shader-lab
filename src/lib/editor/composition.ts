import type { CompositionAspect, SceneConfig, Size } from "@/types/editor"

export type CompositionFrame = {
  height: number
  width: number
  x: number
  y: number
}

export function getCompositionAspectRatio(
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

export function getDocumentSize(
  sceneConfig: Pick<
    SceneConfig,
    "compositionAspect" | "compositionWidth" | "compositionHeight"
  >,
  outputSize: Size
): Size | null {
  if (sceneConfig.compositionAspect === "screen") return null
  if (sceneConfig.compositionAspect === "custom") {
    return {
      width: Math.max(1, Math.round(sceneConfig.compositionWidth)),
      height: Math.max(1, Math.round(sceneConfig.compositionHeight)),
    }
  }
  const ratio = getCompositionAspectRatio(
    sceneConfig.compositionAspect,
    sceneConfig.compositionWidth,
    sceneConfig.compositionHeight
  )
  const width = Math.max(1, Math.round(sceneConfig.compositionWidth))
  const height = Math.max(1, Math.round(sceneConfig.compositionHeight))
  if (ratio !== null && Math.abs(width / height - ratio) / ratio < 0.02) {
    return { width, height }
  }
  const frame = getCenteredCropFrame(outputSize, ratio)
  return { width: frame.width, height: frame.height }
}

export function normalizeCompositionForDocument(
  sceneConfig: SceneConfig,
  composition: Size
): SceneConfig {
  if (
    sceneConfig.compositionAspect === "screen" ||
    sceneConfig.compositionAspect === "custom"
  ) {
    return sceneConfig
  }
  const ratio = getCompositionAspectRatio(sceneConfig.compositionAspect, 1, 1)
  const frame = getCenteredCropFrame(composition, ratio)
  return {
    ...sceneConfig,
    compositionWidth: frame.width,
    compositionHeight: frame.height,
  }
}

export const ARTBOARD_VIEWPORT_PADDING = 24

export function fitDocumentToViewport(
  document: Size,
  viewport: Size,
  padding = ARTBOARD_VIEWPORT_PADDING
): Size {
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = Math.min(
    availableWidth / Math.max(1, document.width),
    availableHeight / Math.max(1, document.height)
  )
  return {
    width: Math.max(1, Math.round(document.width * scale)),
    height: Math.max(1, Math.round(document.height * scale)),
  }
}

export function resolveCompositionUpdate(
  sceneConfig: SceneConfig,
  outputSize: Size,
  updates: { aspect?: CompositionAspect; width?: number; height?: number }
): { sceneConfig: SceneConfig; outputSize: Size } {
  const clampDimension = (value: number) =>
    Math.max(1, Math.min(16384, Math.round(Number.isFinite(value) ? value : 1)))
  const aspect = updates.aspect ?? sceneConfig.compositionAspect
  if (aspect === "screen") {
    return {
      sceneConfig: { ...sceneConfig, compositionAspect: "screen" },
      outputSize,
    }
  }
  let width: number
  let height: number
  if (aspect === "custom") {
    width = clampDimension(updates.width ?? sceneConfig.compositionWidth)
    height = clampDimension(updates.height ?? sceneConfig.compositionHeight)
  } else {
    const ratio = getCompositionAspectRatio(aspect, 1, 1) ?? 1
    if (updates.width !== undefined) {
      width = clampDimension(updates.width)
      height = clampDimension(width / ratio)
    } else if (updates.height !== undefined) {
      height = clampDimension(updates.height)
      width = clampDimension(height * ratio)
    } else {
      const base = getDocumentSize(sceneConfig, outputSize) ?? outputSize
      const frame = getCenteredCropFrame(base, ratio)
      width = clampDimension(frame.width)
      height = clampDimension(frame.height)
    }
  }
  return {
    sceneConfig: {
      ...sceneConfig,
      compositionAspect: aspect,
      compositionWidth: width,
      compositionHeight: height,
    },
    outputSize: { width, height },
  }
}
