"use client"
import { buildRendererFrame } from "@/renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "@/renderer/create-webgpu-renderer"
import {
  createVideoExportEncoder,
  getSupportedVideoExportConfig,
} from "@/lib/editor/video-export-encoder"
import type {
  EditorAsset,
  EditorLayer,
  SceneConfig,
  Size,
  TimelineStateSnapshot,
} from "@/types/editor"

export type ExportAspectPreset = "16:9" | "1:1" | "4:5" | "9:16" | "original"
export type ExportQualityPreset = "draft" | "high" | "standard" | "ultra"
export type VideoExportFormat = "mp4" | "webm"

export const EXPORT_QUALITY_LONG_EDGE: Record<ExportQualityPreset, number> = {
  draft: 1280,
  standard: 1920,
  high: 3840,
  ultra: 7680,
}

const DEFAULT_MAX_EXPORT_DIMENSION = 8192

export const ASPECT_PRESET_LABELS: Record<ExportAspectPreset, string> = {
  "16:9": "16:9",
  "1:1": "1:1",
  "4:5": "4:5",
  "9:16": "9:16",
  original: "Original",
}

type RenderProjectState = {
  assets: EditorAsset[]
  compositionSize: Size
  layers: EditorLayer[]
  sceneConfig: SceneConfig
  timeline: TimelineStateSnapshot
}

type StillExportOptions = {
  aspectPreset: ExportAspectPreset
  qualityPreset: ExportQualityPreset
  time: number
  type?: string
  width: number
  height: number
}

type VideoExportOptions = {
  aspectPreset: ExportAspectPreset
  duration: number
  format: VideoExportFormat
  fps: number
  onProgress?: (progress: { label: string; value: number }) => void
  qualityPreset: ExportQualityPreset
  startTime: number
  width: number
  height: number
}

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.round(value))
}

function getAspectRatio(
  compositionSize: Size,
  aspectPreset: ExportAspectPreset
): number {
  switch (aspectPreset) {
    case "1:1":
      return 1
    case "4:5":
      return 4 / 5
    case "9:16":
      return 9 / 16
    case "16:9":
      return 16 / 9
    default:
      return compositionSize.width / Math.max(compositionSize.height, 1)
  }
}

export function getAspectRatioForPreset(
  compositionSize: Size,
  aspectPreset: ExportAspectPreset
): number {
  return getAspectRatio(compositionSize, aspectPreset)
}

export function getDimensionsForPreset(
  compositionSize: Size,
  aspectPreset: ExportAspectPreset,
  qualityPreset: ExportQualityPreset,
  maxDimension = Number.POSITIVE_INFINITY
): Size {
  const ratio = getAspectRatio(compositionSize, aspectPreset)
  const targetLongEdge = clampDimension(
    Math.min(getMaxDimensionForQuality(qualityPreset), maxDimension)
  )

  if (ratio >= 1) {
    return {
      height: clampDimension(targetLongEdge / ratio),
      width: targetLongEdge,
    }
  }

  return {
    height: targetLongEdge,
    width: clampDimension(targetLongEdge * ratio),
  }
}

export function getMaxDimensionForQuality(
  qualityPreset: ExportQualityPreset
): number {
  return EXPORT_QUALITY_LONG_EDGE[qualityPreset]
}

export function clampExportSize(size: Size, maxDimension: number): Size {
  const width = clampDimension(size.width)
  const height = clampDimension(size.height)
  const limit = clampDimension(maxDimension)
  const longEdge = Math.max(width, height)

  if (longEdge <= limit) {
    return { width, height }
  }

  const scale = limit / longEdge

  return {
    width: clampDimension(width * scale),
    height: clampDimension(height * scale),
  }
}

export async function getMaxExportDimension(): Promise<number> {
  if (
    typeof navigator === "undefined" ||
    !("gpu" in navigator) ||
    typeof navigator.gpu.requestAdapter !== "function"
  ) {
    return DEFAULT_MAX_EXPORT_DIMENSION
  }

  try {
    const adapter = await navigator.gpu.requestAdapter()
    return (
      adapter?.limits.maxTextureDimension2D ?? DEFAULT_MAX_EXPORT_DIMENSION
    )
  } catch {
    return DEFAULT_MAX_EXPORT_DIMENSION
  }
}

function getSourceRenderSizeForExport(
  compositionSize: Size,
  aspectPreset: ExportAspectPreset,
  outputSize: Size
): Size {
  const sourceRatio =
    compositionSize.width / Math.max(compositionSize.height, 1)
  const targetRatio = getAspectRatio(compositionSize, aspectPreset)

  if (Math.abs(targetRatio - sourceRatio) <= 0.0001) {
    return outputSize
  }

  if (targetRatio > sourceRatio) {
    return {
      width: outputSize.width,
      height: clampDimension(outputSize.width / sourceRatio),
    }
  }

  return {
    width: clampDimension(outputSize.height * sourceRatio),
    height: outputSize.height,
  }
}

export async function getSupportedVideoMimeType(
  format: VideoExportFormat
): Promise<string | null> {
  const support = await getSupportedVideoExportConfig(format)
  return support?.mimeType ?? null
}

export async function exportStillImage(
  projectState: RenderProjectState,
  options: StillExportOptions
): Promise<Blob> {
  const maxExportDimension = await getMaxExportDimension()
  const maxAllowedDimension = Math.min(
    maxExportDimension,
    getMaxDimensionForQuality(options.qualityPreset)
  )
  const clampedOutputSize = clampExportSize(
    {
      width: options.width,
      height: options.height,
    },
    maxAllowedDimension
  )
  const outputCanvas = document.createElement("canvas")
  outputCanvas.width = clampedOutputSize.width
  outputCanvas.height = clampedOutputSize.height
  const sourceRenderSize = getSourceRenderSizeForExport(
    projectState.compositionSize,
    options.aspectPreset,
    {
      width: outputCanvas.width,
      height: outputCanvas.height,
    }
  )

  return exportStillWithNewRenderer(
    projectState,
    sourceRenderSize,
    outputCanvas,
    options
  )
}

async function exportStillWithNewRenderer(
  projectState: RenderProjectState,
  sourceRenderSize: Size,
  outputCanvas: HTMLCanvasElement,
  options: StillExportOptions
): Promise<Blob> {
  const renderCanvas = createHiddenRenderCanvas()
  const renderer = await createExportRenderer(renderCanvas)

  try {
    await prewarmExportFrame(renderer, renderCanvas, projectState, {
      logicalSize: projectState.compositionSize,
      renderSize: sourceRenderSize,
      time: options.time,
    })

    await renderFrameToCanvas(renderer, renderCanvas, projectState, {
      logicalSize: projectState.compositionSize,
      renderSize: sourceRenderSize,
      time: options.time,
    })
    cropCanvasToAspect(
      renderCanvas,
      outputCanvas,
      options.aspectPreset,
      projectState.compositionSize
    )

    const blob = await canvasToBlob(outputCanvas, options.type ?? "image/png")

    if (!blob) {
      throw new Error("Could not build the export image.")
    }

    return blob
  } finally {
    renderer.dispose()
    destroyHiddenRenderCanvas(renderCanvas)
  }
}

export async function exportVideo(
  projectState: RenderProjectState,
  options: VideoExportOptions
): Promise<Blob> {
  options.onProgress?.({
    label: "Preparing export",
    value: 0.02,
  })

  const support = await getSupportedVideoExportConfig(options.format)

  if (!support) {
    throw new Error(
      `${options.format.toUpperCase()} export is not supported in this browser.`
    )
  }

  const renderCanvas = createHiddenRenderCanvas()
  const maxExportDimension = await getMaxExportDimension()
  const maxAllowedDimension = Math.min(
    maxExportDimension,
    getMaxDimensionForQuality(options.qualityPreset)
  )
  const exportSize = normalizeVideoExportSize(options.format, {
    ...clampExportSize(
      {
        width: options.width,
        height: options.height,
      },
      maxAllowedDimension
    ),
  })
  const sourceRenderSize = getSourceRenderSizeForExport(
    projectState.compositionSize,
    options.aspectPreset,
    exportSize
  )
  const outputCanvas = document.createElement("canvas")
  outputCanvas.width = exportSize.width
  outputCanvas.height = exportSize.height

  const renderer = await createExportRenderer(renderCanvas)
  const encoder = await createVideoExportEncoder({
    bitrate: getVideoBitrate(options.qualityPreset),
    format: support.format,
    fps: options.fps,
    height: outputCanvas.height,
    width: outputCanvas.width,
  })

  try {
    await prewarmExportFrame(renderer, renderCanvas, projectState, {
      logicalSize: projectState.compositionSize,
      renderSize: sourceRenderSize,
      time: options.startTime,
    })

    const totalFrames = Math.max(1, Math.round(options.duration * options.fps))
    const totalDurationUs = Math.max(1, Math.round(options.duration * 1_000_000))

    options.onProgress?.({
      label: `Rendering frames 0/${totalFrames}`,
      value: 0.08,
    })

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      const time = resolveExportTime(
        options.startTime + frameIndex / options.fps,
        projectState.timeline.duration,
        projectState.timeline.loop
      )

      await renderFrameToCanvas(renderer, renderCanvas, projectState, {
        logicalSize: projectState.compositionSize,
        renderSize: sourceRenderSize,
        time,
      })

      cropCanvasToAspect(
        renderCanvas,
        outputCanvas,
        options.aspectPreset,
        projectState.compositionSize
      )

      const frameStartUs = Math.round((frameIndex * totalDurationUs) / totalFrames)
      const frameEndUs = Math.round(
        ((frameIndex + 1) * totalDurationUs) / totalFrames
      )

      await encoder.encodeCanvasFrame(
        outputCanvas,
        frameIndex,
        Math.max(1, frameEndUs - frameStartUs),
        frameStartUs
      )

      options.onProgress?.({
        label: `Rendering frames ${frameIndex + 1}/${totalFrames}`,
        value: 0.08 + ((frameIndex + 1) / totalFrames) * 0.88,
      })
    }

    options.onProgress?.({
      label: "Finalizing file",
      value: 0.98,
    })

    return await encoder.finalize()
  } finally {
    renderer.dispose()
    destroyHiddenRenderCanvas(renderCanvas)
  }
}

async function createExportRenderer(canvas: HTMLCanvasElement) {
  if (!browserSupportsWebGPU()) {
    throw new Error("WebGPU export is not available in this browser.")
  }

  const renderer = await createWebGPURenderer(canvas)
  await renderer.initialize()
  return renderer
}

async function renderFrameToCanvas(
  renderer: Awaited<ReturnType<typeof createExportRenderer>>,
  canvas: HTMLCanvasElement,
  projectState: RenderProjectState,
  options: {
    logicalSize: Size
    renderSize: Size
    time: number
  }
): Promise<void> {
  const timelineState = structuredClone(projectState.timeline)
  timelineState.currentTime = resolveExportTime(
    options.time,
    timelineState.duration,
    timelineState.loop
  )
  timelineState.isPlaying = false

  canvas.width = options.renderSize.width
  canvas.height = options.renderSize.height
  renderer.resize(options.renderSize, 1)
  const frame = buildRendererFrame({
    assets: projectState.assets,
    clockTime: timelineState.currentTime,
    delta: 0,
    layers: projectState.layers,
    logicalSize: options.logicalSize,
    outputSize: options.renderSize,
    pixelRatio: 1,
    sceneConfig: projectState.sceneConfig,
    timeline: timelineState,
    viewportSize: options.renderSize,
  })
  renderer.render(frame)
  await renderer.prepareForExportFrame(timelineState.currentTime)
  renderer.render(frame)

  await waitForRenderedFrame()
}

async function prewarmExportFrame(
  renderer: Awaited<ReturnType<typeof createExportRenderer>>,
  canvas: HTMLCanvasElement,
  projectState: RenderProjectState,
  options: {
    logicalSize: Size
    renderSize: Size
    time: number
  }
): Promise<void> {
  await renderFrameToCanvas(renderer, canvas, projectState, options)

  const maxWaitMs = 5_000
  const pollInterval = 10
  let elapsed = 0

  while (renderer.hasPendingResources() && elapsed < maxWaitMs) {
    await wait(pollInterval)
    elapsed += pollInterval
  }

  await renderFrameToCanvas(renderer, canvas, projectState, options)
  await waitForRenderedFrame()
  await renderFrameToCanvas(renderer, canvas, projectState, options)
  await waitForRenderedFrame()
}

function cropCanvasToAspect(
  sourceCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  aspectPreset: ExportAspectPreset,
  compositionSize: Size
): void {
  const context = outputCanvas.getContext("2d")

  if (!context) {
    throw new Error("Could not prepare the export canvas.")
  }

  const targetRatio = getAspectRatio(compositionSize, aspectPreset)
  const sourceRatio = sourceCanvas.width / Math.max(sourceCanvas.height, 1)
  let cropWidth = sourceCanvas.width
  let cropHeight = sourceCanvas.height
  let cropX = 0
  let cropY = 0

  if (Math.abs(targetRatio - sourceRatio) > 0.0001) {
    if (targetRatio > sourceRatio) {
      cropHeight = Math.round(sourceCanvas.width / targetRatio)
      cropY = Math.round((sourceCanvas.height - cropHeight) / 2)
    } else {
      cropWidth = Math.round(sourceCanvas.height * targetRatio)
      cropX = Math.round((sourceCanvas.width - cropWidth) / 2)
    }
  }

  context.clearRect(0, 0, outputCanvas.width, outputCanvas.height)
  context.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height
  )
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type)
  })
}

function getVideoBitrate(qualityPreset: ExportQualityPreset): number {
  switch (qualityPreset) {
    case "draft":
      return 6_000_000
    case "high":
      return 16_000_000
    case "ultra":
      return 28_000_000
    default:
      return 10_000_000
  }
}

function normalizeVideoExportSize(
  format: VideoExportFormat,
  size: Size
): Size {
  const width = clampDimension(size.width)
  const height = clampDimension(size.height)

  if (format !== "mp4") {
    return { width, height }
  }

  return {
    width: width % 2 === 0 ? width : width - 1,
    height: height % 2 === 0 ? height : height - 1,
  }
}

function resolveExportTime(
  time: number,
  duration: number,
  loop: boolean
): number {
  if (!(Number.isFinite(time) && Number.isFinite(duration) && duration > 0)) {
    return 0
  }

  if (loop) {
    const remainder = time % duration
    return remainder >= 0 ? remainder : duration + remainder
  }

  return Math.max(0, Math.min(duration, time))
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

function waitForRenderedFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

function createHiddenRenderCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.setAttribute("aria-hidden", "true")
  Object.assign(canvas.style, {
    height: "1px",
    left: "-99999px",
    opacity: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    width: "1px",
  })
  document.body.append(canvas)
  return canvas
}

function destroyHiddenRenderCanvas(canvas: HTMLCanvasElement): void {
  canvas.remove()
}
