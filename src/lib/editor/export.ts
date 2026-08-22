"use client"
import type { AudioModulationInput } from "@/lib/editor/audio/links"
import { decodeAudioBuffer } from "@/lib/editor/audio/decode"
import {
  encodeExportAudio,
  type ExportAudioTrackConfig,
  getEncoderPrimingSeconds,
  planExportAudioSegments,
  renderExportAudio,
  resolveExportAudioConfig,
} from "@/lib/editor/audio/export-audio"
import {
  createVideoExportEncoder,
  getSupportedVideoExportConfig,
} from "@/lib/editor/video-export-encoder"
import { acquirePreviewRenderLock } from "@/lib/editor/preview-render-lock"
import { buildRendererFrame } from "@/renderer/contracts"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
import { browserSupportsWebGPU } from "@/renderer/webgpu-support"
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
const PROGRESS_INTERVAL_MS = 100

export const ASPECT_PRESET_LABELS: Record<ExportAspectPreset, string> = {
  "16:9": "16:9",
  "1:1": "1:1",
  "4:5": "4:5",
  "9:16": "9:16",
  original: "Original",
}

type RenderProjectState = {
  assets: EditorAsset[]
  audio?: AudioModulationInput | null
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

export type VideoExportAudioSource = {
  offsetSeconds: number
  url: string
}

type VideoExportOptions = {
  abortSignal?: AbortSignal
  aspectPreset: ExportAspectPreset
  audioSource?: VideoExportAudioSource | null
  duration: number
  fileStream?: FileSystemWritableFileStream | null
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Video export cancelled.", "AbortError")
  }
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

let maxExportDimensionPromise: Promise<number> | null = null

export function getMaxExportDimension(): Promise<number> {
  maxExportDimensionPromise ??= queryMaxExportDimension()
  return maxExportDimensionPromise
}

async function queryMaxExportDimension(): Promise<number> {
  if (
    typeof navigator === "undefined" ||
    !("gpu" in navigator) ||
    typeof navigator.gpu.requestAdapter !== "function"
  ) {
    return DEFAULT_MAX_EXPORT_DIMENSION
  }

  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter?.limits.maxTextureDimension2D ?? DEFAULT_MAX_EXPORT_DIMENSION
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
      cropAspectRatio: getAspectRatio(
        projectState.compositionSize,
        options.aspectPreset
      ),
      logicalSize: projectState.compositionSize,
      renderSize: sourceRenderSize,
      time: options.time,
    })

    await renderFrameToCanvas(renderer, renderCanvas, projectState, {
      cropAspectRatio: getAspectRatio(
        projectState.compositionSize,
        options.aspectPreset
      ),
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
    await renderer.destroyDevice()
    destroyHiddenRenderCanvas(renderCanvas)
  }
}

type EncodedAudioEntry = {
  chunk: EncodedAudioChunk
  meta: EncodedAudioChunkMetadata | undefined
}

type PreparedExportAudio = {
  chunks: EncodedAudioEntry[]
  config: ExportAudioTrackConfig
}

async function prepareExportAudio(
  projectState: RenderProjectState,
  options: VideoExportOptions
): Promise<PreparedExportAudio | null> {
  const source = options.audioSource

  if (!source) {
    return null
  }

  const config = await resolveExportAudioConfig(options.format)

  if (!config) {
    throw new Error(
      `This browser cannot encode ${options.format === "mp4" ? "AAC" : "Opus"} audio. Export without audio, or use ${options.format === "mp4" ? "WebM" : "MP4"}.`
    )
  }

  let decoded: AudioBuffer | null = await decodeAudioBuffer(
    source.url,
    options.abortSignal
  )
  throwIfAborted(options.abortSignal)

  const segments = planExportAudioSegments({
    durationSeconds: options.duration,
    loop: projectState.timeline.loop,
    offsetSeconds: source.offsetSeconds,
    sourceDurationSeconds: decoded.duration,
    startSeconds:
      options.startTime + getEncoderPrimingSeconds(config.codec),
    timelineDurationSeconds: projectState.timeline.duration,
  })

  if (segments.length === 0) {
    throw new Error(
      "The exported range does not overlap the audio track. Check the audio offset."
    )
  }

  const buffer = await renderExportAudio(decoded, segments, options.duration)
  decoded = null
  throwIfAborted(options.abortSignal)

  const chunks: EncodedAudioEntry[] = []

  await encodeExportAudio({
    addChunk: (chunk, meta) => {
      chunks.push({ chunk, meta })
    },
    buffer,
    config,
    ...(options.abortSignal ? { signal: options.abortSignal } : {}),
  })

  return { chunks, config }
}

export function advanceAudioChunkCursor(
  chunks: { chunk: { timestamp: number } }[],
  cursor: number,
  timestampUs: number
): number {
  let next = Math.max(0, cursor)

  while (next < chunks.length) {
    const entry = chunks[next]

    if (!entry || entry.chunk.timestamp > timestampUs) {
      break
    }

    next += 1
  }

  return next
}

function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return ""
  }

  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s left`
  }

  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)

  return rest === 0
    ? `${minutes}m left`
    : `${minutes}m ${rest.toString().padStart(2, "0")}s left`
}

function buildRenderLabel(
  done: number,
  total: number,
  startedAt: number
): string {
  const base = `Rendering ${done}/${total}`
  const elapsed = (performance.now() - startedAt) / 1000

  if (done < 2 || elapsed <= 0) {
    return base
  }

  const remaining = formatRemaining((elapsed / done) * (total - done))

  return remaining ? `${base} \u00B7 ${remaining}` : base
}

export async function exportVideo(
  projectState: RenderProjectState,
  options: VideoExportOptions
): Promise<Blob | null> {
  const releasePreviewLock = acquirePreviewRenderLock("export")

  try {
    return await runVideoExport(projectState, options)
  } finally {
    releasePreviewLock()
  }
}

async function runVideoExport(
  projectState: RenderProjectState,
  options: VideoExportOptions
): Promise<Blob | null> {
  throwIfAborted(options.abortSignal)
  options.onProgress?.({
    label: options.audioSource ? "Decoding audio" : "Preparing export",
    value: 0.02,
  })

  const preparedAudio = await prepareExportAudio(projectState, options)
  const support = await getSupportedVideoExportConfig(options.format)

  if (!support) {
    throw new Error(
      `${options.format.toUpperCase()} export is not supported in this browser.`
    )
  }

  let renderCanvas: HTMLCanvasElement | null = null
  let renderer: Awaited<ReturnType<typeof createExportRenderer>> | null = null
  let encoder: Awaited<ReturnType<typeof createVideoExportEncoder>> | null = null
  let finalized = false

  try {
    renderCanvas = createHiddenRenderCanvas()
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

    const totalFrames = Math.max(1, Math.round(options.duration * options.fps))
    renderer = await createExportRenderer(renderCanvas)
    encoder = await createVideoExportEncoder({
      audio: preparedAudio
        ? {
            codec: preparedAudio.config.codec,
            numberOfChannels: preparedAudio.config.numberOfChannels,
            sampleRate: preparedAudio.config.sampleRate,
          }
        : null,
      bitrate: getVideoBitrate(options.qualityPreset),
      expectedAudioChunks: preparedAudio?.chunks.length ?? 0,
      expectedVideoChunks: totalFrames,
      fileStream: options.fileStream ?? null,
      format: support.format,
      fps: options.fps,
      height: outputCanvas.height,
      width: outputCanvas.width,
    })

    throwIfAborted(options.abortSignal)

    const activeEncoder = encoder
    const audioChunks = preparedAudio?.chunks ?? []
    let audioCursor = 0

    const drainAudioThrough = (timestampUs: number) => {
      const next = advanceAudioChunkCursor(
        audioChunks,
        audioCursor,
        timestampUs
      )

      for (let index = audioCursor; index < next; index += 1) {
        const entry = audioChunks[index]

        if (entry) {
          activeEncoder.addAudioChunk(entry.chunk, entry.meta)
        }
      }

      audioCursor = next
    }

    await prewarmExportFrame(renderer, renderCanvas, projectState, {
      cropAspectRatio: getAspectRatio(
        projectState.compositionSize,
        options.aspectPreset
      ),
      logicalSize: projectState.compositionSize,
      renderSize: sourceRenderSize,
      time: options.startTime,
    })

    const totalDurationUs = Math.max(
      1,
      Math.round(options.duration * 1_000_000)
    )

    options.onProgress?.({
      label: `Rendering 0/${totalFrames}`,
      value: 0.08,
    })

    const renderStartedAt = performance.now()
    let lastProgressAt = renderStartedAt

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      throwIfAborted(options.abortSignal)
      const time = resolveExportTime(
        options.startTime + frameIndex / options.fps,
        projectState.timeline.duration,
        projectState.timeline.loop
      )

      await renderFrameToCanvas(renderer, renderCanvas, projectState, {
        bootstrapPasses: frameIndex === 0,
        cropAspectRatio: getAspectRatio(
          projectState.compositionSize,
          options.aspectPreset
        ),
        delta: frameIndex === 0 ? 0 : 1 / options.fps,
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

      const frameStartUs = Math.round(
        (frameIndex * totalDurationUs) / totalFrames
      )
      const frameEndUs = Math.round(
        ((frameIndex + 1) * totalDurationUs) / totalFrames
      )

      await encoder.encodeCanvasFrame(
        outputCanvas,
        frameIndex,
        Math.max(1, frameEndUs - frameStartUs),
        frameStartUs
      )
      drainAudioThrough(frameEndUs)
      throwIfAborted(options.abortSignal)

      const isLastFrame = frameIndex === totalFrames - 1
      const now = performance.now()

      if (isLastFrame || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
        lastProgressAt = now
        options.onProgress?.({
          label: buildRenderLabel(
            frameIndex + 1,
            totalFrames,
            renderStartedAt
          ),
          value: 0.08 + ((frameIndex + 1) / totalFrames) * 0.88,
        })
      }
    }

    drainAudioThrough(Number.POSITIVE_INFINITY)

    options.onProgress?.({
      label: "Finalizing file",
      value: 0.98,
    })
    throwIfAborted(options.abortSignal)

    const blob = await encoder.finalize()
    finalized = true
    return blob
  } finally {
    if (encoder && !finalized) {
      await encoder.close()
    }

    if (renderer) {
      renderer.dispose()
      await renderer.destroyDevice()
    }

    if (renderCanvas) {
      destroyHiddenRenderCanvas(renderCanvas)
    }
  }
}

async function createExportRenderer(canvas: HTMLCanvasElement) {
  if (!browserSupportsWebGPU()) {
    throw new Error("WebGPU export is not available in this browser.")
  }

  const renderer = await createWebGPURenderer(canvas, {
    strictPassFailures: true,
  })
  await renderer.initialize()
  return renderer
}

async function renderFrameToCanvas(
  renderer: Awaited<ReturnType<typeof createExportRenderer>>,
  canvas: HTMLCanvasElement,
  projectState: RenderProjectState,
  options: {
    bootstrapPasses?: boolean
    cropAspectRatio: number | null
    delta?: number
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

  if (
    canvas.width !== options.renderSize.width ||
    canvas.height !== options.renderSize.height
  ) {
    canvas.width = options.renderSize.width
    canvas.height = options.renderSize.height
    renderer.resize(options.renderSize, 1)
  }

  const buildFrame = (delta: number) =>
    buildRendererFrame({
      assets: projectState.assets,
      audio: projectState.audio ?? null,
      clockTime: timelineState.currentTime,
      cropAspectRatio: options.cropAspectRatio,
      delta,
      layers: projectState.layers,
      logicalSize: options.logicalSize,
      outputSize: options.renderSize,
      pixelRatio: 1,
      sceneConfig: projectState.sceneConfig,
      timeline: timelineState,
      viewportSize: options.renderSize,
    })

  if (options.bootstrapPasses) {
    renderer.render(buildFrame(0))
  }

  await renderer.prepareForExportFrame(
    timelineState.currentTime,
    timelineState.loop
  )

  renderer.render(buildFrame(options.delta ?? 0))

  const synced = await renderer.waitForGpuIdle()

  if (!synced) {
    await waitForPresentedFrame()
  }
}

async function prewarmExportFrame(
  renderer: Awaited<ReturnType<typeof createExportRenderer>>,
  canvas: HTMLCanvasElement,
  projectState: RenderProjectState,
  options: {
    cropAspectRatio: number | null
    logicalSize: Size
    renderSize: Size
    time: number
  }
): Promise<void> {
  await renderFrameToCanvas(renderer, canvas, projectState, {
    ...options,
    bootstrapPasses: true,
  })

  const maxWaitMs = 5_000
  const pollInterval = 10
  const startedAt = performance.now()

  while (
    renderer.hasPendingResources() &&
    performance.now() - startedAt < maxWaitMs
  ) {
    await wait(pollInterval)
  }

  await renderFrameToCanvas(renderer, canvas, projectState, {
    ...options,
    bootstrapPasses: true,
  })
  await renderFrameToCanvas(renderer, canvas, projectState, {
    ...options,
    bootstrapPasses: true,
  })
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

export const STREAM_TO_DISK_THRESHOLD_BYTES = 256 * 1024 * 1024

export function estimateVideoExportBytes(
  qualityPreset: ExportQualityPreset,
  durationSeconds: number
): number {
  const safeDuration = Number.isFinite(durationSeconds)
    ? Math.max(0, durationSeconds)
    : 0

  return (getVideoBitrate(qualityPreset) / 8) * safeDuration
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

function normalizeVideoExportSize(format: VideoExportFormat, size: Size): Size {
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

function waitForPresentedFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 250)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.clearTimeout(timer)
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
