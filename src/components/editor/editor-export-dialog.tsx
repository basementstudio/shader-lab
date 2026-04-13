"use client"

import {
  CopyIcon,
  FileArrowDownIcon,
  FolderIcon,
  UploadSimpleIcon,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { getEffectiveCompositionSize } from "@/lib/editor/composition"
import {
  ASPECT_PRESET_LABELS,
  clampExportSize,
  type ExportAspectPreset,
  type ExportQualityPreset,
  exportStillImage,
  exportVideo,
  getAspectRatioForPreset,
  getDimensionsForPreset,
  getMaxDimensionForQuality,
  getMaxExportDimension,
  getSupportedVideoMimeType,
  type VideoExportFormat,
} from "@/lib/editor/export"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import {
  buildShaderExportConfig,
  validateShaderExportSupport,
} from "@/lib/editor/shader-export"
import { generateShaderExportSnippet } from "@/lib/editor/shader-export-snippet"
import {
  useAssetStore,
  useEditorStore,
  useLayerStore,
  useTimelineStore,
} from "@/store"

type ExportTab = "image" | "project" | "shader" | "video"

const QUALITY_LABELS: Record<ExportQualityPreset, string> = {
  draft: "Draft",
  high: "High",
  standard: "Standard",
  ultra: "Ultra",
}

const ASPECT_PRESETS: ExportAspectPreset[] = [
  "original",
  "1:1",
  "4:5",
  "16:9",
  "9:16",
]
const QUALITY_PRESETS: ExportQualityPreset[] = [
  "draft",
  "standard",
  "high",
  "ultra",
]
const VIDEO_FPS_PRESETS = [24, 30, 60] as const
const DEFAULT_VIDEO_EXPORT_DURATION = 8
const VIDEO_DURATION_STEP = 0.25
const DEFAULT_MAX_EXPORT_DIMENSION = 8192

function roundDurationForExport(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_VIDEO_EXPORT_DURATION
  }

  return Math.max(
    VIDEO_DURATION_STEP,
    Math.round(value / VIDEO_DURATION_STEP) * VIDEO_DURATION_STEP
  )
}

interface EditorExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditorExportDialog({
  open,
  onOpenChange,
}: EditorExportDialogProps) {
  const reduceMotion = useReducedMotion() ?? false
  const canvasSize = useEditorStore((state) => state.canvasSize)
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const compositionSize = useMemo(
    () => getEffectiveCompositionSize(sceneConfig, canvasSize),
    [canvasSize, sceneConfig]
  )
  const assets = useAssetStore((state) => state.assets)
  const layers = useLayerStore((state) => state.layers)
  const timelineDuration = useTimelineStore((state) => state.duration)
  const timelineLoop = useTimelineStore((state) => state.loop)
  const timelineTracks = useTimelineStore((state) => state.tracks)
  const [activeTab, setActiveTab] = useState<ExportTab>("image")
  const [mounted, setMounted] = useState(false)
  const [isDraggingImport, setIsDraggingImport] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [maxExportDimension, setMaxExportDimension] = useState(
    DEFAULT_MAX_EXPORT_DIMENSION
  )
  const [imageAspect, setImageAspect] = useState<ExportAspectPreset>("original")
  const [imageQuality, setImageQuality] =
    useState<ExportQualityPreset>("standard")
  const [imageSize, setImageSize] = useState(() =>
    getDimensionsForPreset(
      useEditorStore.getState().canvasSize,
      "original",
      "standard",
      DEFAULT_MAX_EXPORT_DIMENSION
    )
  )
  const [videoAspect, setVideoAspect] = useState<ExportAspectPreset>("original")
  const [videoQuality, setVideoQuality] =
    useState<ExportQualityPreset>("standard")
  const [videoSize, setVideoSize] = useState(() =>
    getDimensionsForPreset(
      useEditorStore.getState().canvasSize,
      "original",
      "standard",
      DEFAULT_MAX_EXPORT_DIMENSION
    )
  )
  const [videoDuration, setVideoDuration] = useState(timelineDuration)
  const [videoFps, setVideoFps] = useState(30)
  const [videoFormat, setVideoFormat] = useState<VideoExportFormat>("webm")
  const [videoDurationDirty, setVideoDurationDirty] = useState(false)
  const [videoProgress, setVideoProgress] = useState<{
    label: string
    value: number
  } | null>(null)
  const [videoSupport, setVideoSupport] = useState({
    mp4: false,
    webm: false,
  })
  const [isCopyingShader, setIsCopyingShader] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  const shaderExportIssues = useMemo(
    () => validateShaderExportSupport(layers, assets),
    [assets, layers]
  )
  const defaultVideoDuration = useMemo(() => {
    const assetById = new Map(assets.map((asset) => [asset.id, asset]))
    const longestVideoDuration = layers.reduce((longest, layer) => {
      if (
        !(layer.kind === "source" && layer.type === "video" && layer.assetId)
      ) {
        return longest
      }

      const duration = assetById.get(layer.assetId)?.duration

      return typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration > 0
        ? Math.max(longest, duration)
        : longest
    }, 0)

    return roundDurationForExport(
      longestVideoDuration > 0
        ? longestVideoDuration
        : DEFAULT_VIDEO_EXPORT_DURATION
    )
  }, [assets, layers])
  const shaderSnippet = useMemo(() => {
    if (shaderExportIssues.length > 0) {
      return null
    }

    return generateShaderExportSnippet(
      buildShaderExportConfig({
        assets,
        composition: compositionSize,
        layers,
        timeline: {
          duration: timelineDuration,
          loop: timelineLoop,
          tracks: timelineTracks,
        },
      })
    )
  }, [
    assets,
    compositionSize,
    layers,
    shaderExportIssues,
    timelineDuration,
    timelineLoop,
    timelineTracks,
  ])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    void getMaxExportDimension().then((dimension) => {
      if (!cancelled) {
        setMaxExportDimension(dimension)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      getSupportedVideoMimeType("webm"),
      getSupportedVideoMimeType("mp4"),
    ]).then(([webm, mp4]) => {
      if (cancelled) {
        return
      }

      setVideoSupport({
        mp4: Boolean(mp4),
        webm: Boolean(webm),
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const node = measureRef.current

    if (!node) {
      return
    }

    const updateHeight = () => {
      setContentHeight(Math.ceil(node.getBoundingClientRect().height))
    }

    updateHeight()

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    setImageSize(
      getDimensionsForPreset(
        compositionSize,
        imageAspect,
        imageQuality,
        maxExportDimension
      )
    )
  }, [compositionSize, imageAspect, imageQuality, maxExportDimension])

  useEffect(() => {
    setVideoSize(
      getDimensionsForPreset(
        compositionSize,
        videoAspect,
        videoQuality,
        maxExportDimension
      )
    )
  }, [compositionSize, videoAspect, videoQuality, maxExportDimension])

  useEffect(() => {
    if (!open || videoDurationDirty) {
      return
    }

    setVideoDuration(defaultVideoDuration)
  }, [defaultVideoDuration, open, videoDurationDirty])

  useEffect(() => {
    if (!open) {
      return
    }

    setVideoDuration(defaultVideoDuration)
    setVideoDurationDirty(false)
    setVideoProgress(null)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [defaultVideoDuration, onOpenChange, open])

  const clearFeedback = useCallback(() => {
    setErrorMessage(null)
    setStatusMessage(null)
  }, [])

  const setNextTab = useCallback(
    (nextTab: ExportTab) => {
      if (nextTab === activeTab) {
        return
      }

      clearFeedback()
      setActiveTab(nextTab)
    },
    [activeTab, clearFeedback]
  )

  const imageMaxDimension = Math.min(
    maxExportDimension,
    getMaxDimensionForQuality(imageQuality)
  )
  const videoMaxDimension = Math.min(
    maxExportDimension,
    getMaxDimensionForQuality(videoQuality)
  )

  function updateImageWidth(nextWidth: number) {
    const width = Math.max(1, Math.round(nextWidth))
    const ratio = getAspectRatioForPreset(compositionSize, imageAspect)

    setImageSize(
      clampExportSize(
        {
          height: Math.max(1, Math.round(width / ratio)),
          width,
        },
        imageMaxDimension
      )
    )
  }

  function updateImageHeight(nextHeight: number) {
    const height = Math.max(1, Math.round(nextHeight))
    const ratio = getAspectRatioForPreset(compositionSize, imageAspect)

    setImageSize(
      clampExportSize(
        {
          height,
          width: Math.max(1, Math.round(height * ratio)),
        },
        imageMaxDimension
      )
    )
  }

  function updateVideoWidth(nextWidth: number) {
    const width = Math.max(1, Math.round(nextWidth))
    const ratio = getAspectRatioForPreset(compositionSize, videoAspect)

    setVideoSize(
      clampExportSize(
        {
          height: Math.max(1, Math.round(width / ratio)),
          width,
        },
        videoMaxDimension
      )
    )
  }

  function updateVideoHeight(nextHeight: number) {
    const height = Math.max(1, Math.round(nextHeight))
    const ratio = getAspectRatioForPreset(compositionSize, videoAspect)

    setVideoSize(
      clampExportSize(
        {
          height,
          width: Math.max(1, Math.round(height * ratio)),
        },
        videoMaxDimension
      )
    )
  }

  async function handleImageExport() {
    clearFeedback()
    setIsWorking(true)

    try {
      const clockTime = useTimelineStore.getState().lastRenderedClockTime
      const blob = await exportStillImage(buildRenderProjectState(), {
        aspectPreset: imageAspect,
        qualityPreset: imageQuality,
        time: clockTime,
        width: imageSize.width,
        height: imageSize.height,
      })

      downloadBlob(blob, buildDownloadName("png"))
      setStatusMessage(
        `PNG exported at ${imageSize.width}×${imageSize.height}.`
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Image export failed."
      )
    } finally {
      setIsWorking(false)
    }
  }

  async function handleVideoExport() {
    clearFeedback()
    setIsWorking(true)

    try {
      const startTime = useTimelineStore.getState().currentTime
      const exportSize = getVideoExportDisplaySize(videoFormat, videoSize)
      const blob = await exportVideo(buildRenderProjectState(), {
        aspectPreset: videoAspect,
        duration: Math.max(0.25, videoDuration),
        format: videoFormat,
        fps: Math.max(1, videoFps),
        onProgress: setVideoProgress,
        qualityPreset: videoQuality,
        startTime,
        width: videoSize.width,
        height: videoSize.height,
      })

      downloadBlob(blob, buildDownloadName(videoFormat))
      setVideoProgress({
        label: "Export complete",
        value: 1,
      })
      setStatusMessage(
        `${videoFormat.toUpperCase()} exported at ${exportSize.width}×${exportSize.height}.`
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Video export failed."
      )
    } finally {
      setIsWorking(false)
    }
  }

  async function handleProjectExport() {
    clearFeedback()

    try {
      const projectFile = buildLabProjectFile()
      const blob = new Blob([JSON.stringify(projectFile, null, 2)], {
        type: "application/json",
      })

      downloadBlob(blob, buildDownloadName("lab"))
      setStatusMessage("Shader Lab project exported.")
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Project export failed."
      )
    }
  }

  async function handleProjectImport(file: File) {
    clearFeedback()
    setIsWorking(true)

    try {
      const input = await file.text()
      const projectFile = parseLabProjectFile(input)
      const result = applyLabProjectFile(
        projectFile,
        useAssetStore.getState().assets
      )

      setStatusMessage(
        result.missingAssetCount > 0
          ? `Project imported. ${result.missingAssetCount} media layer(s) need relinking.`
          : "Project imported."
      )
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Project import failed."
      )
    } finally {
      setIsWorking(false)
      setIsDraggingImport(false)
    }
  }

  async function handleShaderCopy() {
    clearFeedback()

    if (!shaderSnippet) {
      setErrorMessage(
        shaderExportIssues[0]?.message ??
          "Shader export is not available for this project."
      )
      return
    }

    setIsCopyingShader(true)

    try {
      await copyToClipboard(shaderSnippet)
      setStatusMessage("Shader snippet copied to clipboard.")
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not copy shader snippet."
      )
    } finally {
      setIsCopyingShader(false)
    }
  }

  function handleImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""

    if (!file) {
      return
    }

    void handleProjectImport(file)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDraggingImport(false)

    const file = event.dataTransfer.files?.[0]

    if (!file) {
      return
    }

    void handleProjectImport(file)
  }

  if (!mounted) {
    return null
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-90" role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close export dialog"
            className="absolute inset-0 w-full border-0 bg-[rgb(4_5_7_/_0.56)]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={{
              duration: reduceMotion ? 0.12 : 0.18,
              ease: "easeOut",
            }}
            type="button"
          />

          <div className="absolute top-[76px] left-1/2 w-[min(560px,calc(100vw-32px))] max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2">
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              className="w-full"
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: -10 }
              }
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: 10 }
              }
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: "easeOut" }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <GlassPanel
                aria-modal="true"
                className="max-h-[calc(100vh-112px)] overflow-hidden p-0"
                role="dialog"
                variant="panel"
              >
                <div className="flex items-center justify-between border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                  <Typography as="h2" className="leading-5" variant="title">
                    Export
                  </Typography>
                  <IconButton
                    aria-label="Close export dialog"
                    className="h-7 w-7"
                    onClick={() => onOpenChange(false)}
                    variant="default"
                  >
                    <X size={18} weight="bold" />
                  </IconButton>
                </div>

                <div className="flex gap-1.5 border-b border-[var(--ds-border-divider)] px-4 py-[10px]">
                  {(["image", "video", "shader", "project"] as const).map(
                    (tab) => (
                      <button
                        className={cn(
                          "inline-flex min-h-7 items-center justify-center rounded-[var(--ds-radius-control)] border border-transparent px-[10px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:bg-[var(--ds-color-surface-subtle)] hover:border-[var(--ds-border-subtle)]",
                          activeTab === tab &&
                            "bg-[var(--ds-color-surface-active)] border-[var(--ds-border-active)]"
                        )}
                        key={tab}
                        onClick={() => setNextTab(tab)}
                        type="button"
                      >
                        <Typography
                          as="span"
                          tone={activeTab === tab ? "primary" : "tertiary"}
                          variant="label"
                        >
                          {tab}
                        </Typography>
                      </button>
                    )
                  )}
                </div>

                <motion.div
                  animate={
                    contentHeight === null
                      ? { height: "auto" }
                      : { height: contentHeight }
                  }
                  className="overflow-hidden px-4 pt-[14px] pb-4"
                  transition={
                    reduceMotion
                      ? { duration: 0.12, ease: "easeOut" }
                      : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-0 -z-1 w-full invisible"
                  >
                    <div className="w-full" ref={measureRef}>
                      {activeTab === "image" ? (
                        <ImageTabContent
                          imageAspect={imageAspect}
                          imageQuality={imageQuality}
                          imageSize={imageSize}
                          isWorking={isWorking}
                          maxExportDimension={maxExportDimension}
                          onExport={handleImageExport}
                          onImageAspectChange={setImageAspect}
                          onImageHeightChange={updateImageHeight}
                          onImageQualityChange={setImageQuality}
                          onImageWidthChange={updateImageWidth}
                        />
                      ) : null}
                      {activeTab === "video" ? (
                        <VideoTabContent
                          isWorking={isWorking}
                          maxExportDimension={maxExportDimension}
                          mp4Supported={videoSupport.mp4}
                          onExport={handleVideoExport}
                          onVideoAspectChange={setVideoAspect}
                          onVideoDurationChange={(value) => {
                            setVideoDurationDirty(true)
                            setVideoDuration(value)
                          }}
                          onVideoFpsChange={setVideoFps}
                          onVideoFormatChange={setVideoFormat}
                          onVideoHeightChange={updateVideoHeight}
                          onVideoQualityChange={setVideoQuality}
                          onVideoWidthChange={updateVideoWidth}
                          videoAspect={videoAspect}
                          videoDuration={videoDuration}
                          videoFormat={videoFormat}
                          videoFps={videoFps}
                          videoProgress={videoProgress}
                          videoQuality={videoQuality}
                          videoSize={videoSize}
                          webmSupported={videoSupport.webm}
                        />
                      ) : null}
                      {activeTab === "project" ? (
                        <ProjectTabContent
                          importInputRef={importInputRef}
                          isDraggingImport={isDraggingImport}
                          isWorking={isWorking}
                          onDragStateChange={setIsDraggingImport}
                          onExport={handleProjectExport}
                          onFileChange={handleImportChange}
                          onImportBrowse={() => importInputRef.current?.click()}
                          onImportDrop={handleDrop}
                        />
                      ) : null}
                      {activeTab === "shader" ? (
                        <ShaderTabContent
                          isCopying={isCopyingShader}
                          issues={shaderExportIssues}
                          onCopy={handleShaderCopy}
                          snippet={shaderSnippet}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="relative">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        animate={{ opacity: 1 }}
                        className="w-full"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key={activeTab}
                        transition={
                          reduceMotion
                            ? { duration: 0.12, ease: "easeOut" }
                            : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                        }
                      >
                        {activeTab === "image" ? (
                          <ImageTabContent
                            imageAspect={imageAspect}
                            imageQuality={imageQuality}
                            imageSize={imageSize}
                            isWorking={isWorking}
                            maxExportDimension={maxExportDimension}
                            onExport={handleImageExport}
                            onImageAspectChange={setImageAspect}
                            onImageHeightChange={updateImageHeight}
                            onImageQualityChange={setImageQuality}
                            onImageWidthChange={updateImageWidth}
                          />
                        ) : null}
                        {activeTab === "video" ? (
                          <VideoTabContent
                            isWorking={isWorking}
                            maxExportDimension={maxExportDimension}
                            mp4Supported={videoSupport.mp4}
                            onExport={handleVideoExport}
                            onVideoAspectChange={setVideoAspect}
                            onVideoDurationChange={(value) => {
                              setVideoDurationDirty(true)
                              setVideoDuration(value)
                            }}
                            onVideoFpsChange={setVideoFps}
                            onVideoFormatChange={setVideoFormat}
                            onVideoHeightChange={updateVideoHeight}
                            onVideoQualityChange={setVideoQuality}
                            onVideoWidthChange={updateVideoWidth}
                            videoAspect={videoAspect}
                            videoDuration={videoDuration}
                            videoFormat={videoFormat}
                            videoFps={videoFps}
                            videoProgress={videoProgress}
                            videoQuality={videoQuality}
                            videoSize={videoSize}
                            webmSupported={videoSupport.webm}
                          />
                        ) : null}
                        {activeTab === "project" ? (
                          <ProjectTabContent
                            importInputRef={importInputRef}
                            isDraggingImport={isDraggingImport}
                            isWorking={isWorking}
                            onDragStateChange={setIsDraggingImport}
                            onExport={handleProjectExport}
                            onFileChange={handleImportChange}
                            onImportBrowse={() =>
                              importInputRef.current?.click()
                            }
                            onImportDrop={handleDrop}
                          />
                        ) : null}
                        {activeTab === "shader" ? (
                          <ShaderTabContent
                            isCopying={isCopyingShader}
                            issues={shaderExportIssues}
                            onCopy={handleShaderCopy}
                            snippet={shaderSnippet}
                          />
                        ) : null}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>

                {errorMessage ? (
                  <Typography
                    className="mx-4 mb-4 rounded-[var(--ds-radius-control)] border border-[rgb(255_74_74_/_0.18)] bg-[rgb(255_74_74_/_0.08)] px-3 py-[10px] leading-[14px] text-[rgb(255_191_191_/_0.92)]"
                    variant="caption"
                  >
                    {errorMessage}
                  </Typography>
                ) : null}
                {statusMessage ? (
                  <Typography
                    className="mx-4 mb-4 rounded-[var(--ds-radius-control)] border border-white/9 bg-white/6 px-3 py-[10px] leading-[14px]"
                    tone="secondary"
                    variant="caption"
                  >
                    {statusMessage}
                  </Typography>
                ) : null}
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

function ImageTabContent({
  imageAspect,
  imageQuality,
  imageSize,
  isWorking,
  maxExportDimension,
  onExport,
  onImageAspectChange,
  onImageHeightChange,
  onImageQualityChange,
  onImageWidthChange,
}: {
  imageAspect: ExportAspectPreset
  imageQuality: ExportQualityPreset
  imageSize: { height: number; width: number }
  isWorking: boolean
  maxExportDimension: number
  onExport: () => Promise<void>
  onImageAspectChange: (preset: ExportAspectPreset) => void
  onImageHeightChange: (value: number) => void
  onImageQualityChange: (preset: ExportQualityPreset) => void
  onImageWidthChange: (value: number) => void
}) {
  return (
    <section className="flex flex-col gap-[14px]">
      <FieldLabel label="Aspect">
        <PresetRow>
          {ASPECT_PRESETS.map((preset) => (
            <PillButton
              active={imageAspect === preset}
              key={preset}
              label={ASPECT_PRESET_LABELS[preset]}
              onClick={() => onImageAspectChange(preset)}
            />
          ))}
        </PresetRow>
      </FieldLabel>

      <FieldLabel label="Quality">
        <PresetRow>
          {QUALITY_PRESETS.map((preset) => (
            <PillButton
              active={imageQuality === preset}
              key={preset}
              label={QUALITY_LABELS[preset]}
              onClick={() => onImageQualityChange(preset)}
            />
          ))}
        </PresetRow>
      </FieldLabel>

      <DimensionFields
        height={imageSize.height}
        onHeightChange={onImageHeightChange}
        onWidthChange={onImageWidthChange}
        width={imageSize.width}
      />

      <Typography className="leading-[14px]" tone="muted" variant="caption">
        Uses the current playhead frame. Max export dimension on this device:{" "}
        {maxExportDimension}px.
      </Typography>

      <Button disabled={isWorking} onClick={() => void onExport()}>
        <FileArrowDownIcon size={16} weight="bold" />
        Export PNG
      </Button>
    </section>
  )
}

function VideoTabContent({
  isWorking,
  maxExportDimension,
  mp4Supported,
  onExport,
  onVideoAspectChange,
  onVideoDurationChange,
  onVideoFpsChange,
  onVideoFormatChange,
  onVideoHeightChange,
  onVideoQualityChange,
  onVideoWidthChange,
  videoAspect,
  videoDuration,
  videoFormat,
  videoFps,
  videoProgress,
  videoQuality,
  videoSize,
  webmSupported,
}: {
  isWorking: boolean
  maxExportDimension: number
  mp4Supported: boolean
  onExport: () => Promise<void>
  onVideoAspectChange: (preset: ExportAspectPreset) => void
  onVideoDurationChange: (value: number) => void
  onVideoFpsChange: (value: number) => void
  onVideoFormatChange: (format: VideoExportFormat) => void
  onVideoHeightChange: (value: number) => void
  onVideoQualityChange: (preset: ExportQualityPreset) => void
  onVideoWidthChange: (value: number) => void
  videoAspect: ExportAspectPreset
  videoDuration: number
  videoFormat: VideoExportFormat
  videoFps: number
  videoProgress: { label: string; value: number } | null
  videoQuality: ExportQualityPreset
  videoSize: { height: number; width: number }
  webmSupported: boolean
}) {
  const selectedFormatSupported =
    videoFormat === "webm" ? webmSupported : mp4Supported
  const progressValue = Math.max(0, Math.min(videoProgress?.value ?? 0, 1))

  return (
    <section className="flex flex-col gap-[14px]">
      <FieldLabel label="Format">
        <PresetRow>
          <PillButton
            active={videoFormat === "webm"}
            disabled={!webmSupported}
            label="WebM"
            onClick={() => onVideoFormatChange("webm")}
          />
          <PillButton
            active={videoFormat === "mp4"}
            disabled={!mp4Supported}
            label="MP4"
            onClick={() => onVideoFormatChange("mp4")}
          />
        </PresetRow>
      </FieldLabel>

      <FieldLabel label="Aspect">
        <PresetRow>
          {ASPECT_PRESETS.map((preset) => (
            <PillButton
              active={videoAspect === preset}
              key={preset}
              label={ASPECT_PRESET_LABELS[preset]}
              onClick={() => onVideoAspectChange(preset)}
            />
          ))}
        </PresetRow>
      </FieldLabel>

      <FieldLabel label="Quality">
        <PresetRow>
          {QUALITY_PRESETS.map((preset) => (
            <PillButton
              active={videoQuality === preset}
              key={preset}
              label={QUALITY_LABELS[preset]}
              onClick={() => onVideoQualityChange(preset)}
            />
          ))}
        </PresetRow>
      </FieldLabel>

      <DimensionFields
        height={videoSize.height}
        onHeightChange={onVideoHeightChange}
        onWidthChange={onVideoWidthChange}
        width={videoSize.width}
      />

      <div className="grid gap-[10px] min-[900px]:grid-cols-2">
        <FieldLabel label="FPS">
          <PresetRow>
            {VIDEO_FPS_PRESETS.map((fps) => (
              <PillButton
                active={videoFps === fps}
                key={fps}
                label={`${fps}`}
                onClick={() => onVideoFpsChange(fps)}
              />
            ))}
          </PresetRow>
        </FieldLabel>

        <FieldLabel label="Duration">
          <NumberInput
            min={0.25}
            onChange={onVideoDurationChange}
            step={0.25}
            value={videoDuration}
          />
        </FieldLabel>
      </div>

      <div className="flex min-h-11 flex-col justify-center gap-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[var(--ds-color-text-primary)] transition-[width] duration-160 ease-[var(--ease-out-cubic)]"
            style={{
              width: `${progressValue * 100}%`,
            }}
          />
        </div>
        <Typography className="leading-[14px]" tone="muted" variant="caption">
          {videoProgress?.label ??
            `Max export dimension on this device: ${maxExportDimension}px.`}
        </Typography>
      </div>

      <Button
        disabled={isWorking || !selectedFormatSupported}
        onClick={() => void onExport()}
      >
        <FileArrowDownIcon size={16} weight="bold" />
        Export {videoFormat.toUpperCase()}
      </Button>
    </section>
  )
}

function ProjectTabContent({
  importInputRef,
  isDraggingImport,
  isWorking,
  onDragStateChange,
  onExport,
  onFileChange,
  onImportBrowse,
  onImportDrop,
}: {
  importInputRef: React.RefObject<HTMLInputElement | null>
  isDraggingImport: boolean
  isWorking: boolean
  onDragStateChange: (dragging: boolean) => void
  onExport: () => Promise<void>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onImportBrowse: () => void
  onImportDrop: (event: DragEvent<HTMLLabelElement>) => void
}) {
  return (
    <section className="flex flex-col gap-[14px]">
      <Button disabled={isWorking} onClick={() => void onExport()}>
        <FileArrowDownIcon size={16} weight="bold" />
        Export .lab file
      </Button>

      <label
        className={cn(
          "grid items-center gap-3 rounded-[var(--ds-radius-panel)] border border-dashed border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-subtle)] p-[14px] min-[900px]:grid-cols-[auto_1fr_auto]",
          isDraggingImport &&
            "border-[var(--ds-border-hover)] bg-[var(--ds-color-surface-active)]"
        )}
        onDragEnter={() => onDragStateChange(true)}
        onDragLeave={() => onDragStateChange(false)}
        onDragOver={(event) => {
          event.preventDefault()

          if (!isDraggingImport) {
            onDragStateChange(true)
          }
        }}
        onDrop={onImportDrop}
      >
        <input
          accept=".lab,application/json"
          className="hidden"
          onChange={onFileChange}
          ref={importInputRef}
          type="file"
        />

        <UploadSimpleIcon size={20} weight="bold" />
        <div>
          <Typography className="leading-4" variant="label">
            Import .lab configuration
          </Typography>
          <Typography className="mt-1" tone="tertiary" variant="caption">
            Drag and drop here. This will replace your current setup.
          </Typography>
        </div>

        <IconButton
          disabled={isWorking}
          onClick={(event) => {
            event.preventDefault()
            onImportBrowse()
          }}
          variant="active"
        >
          <FolderIcon size={20} />
        </IconButton>
      </label>
    </section>
  )
}

function ShaderTabContent({
  isCopying,
  issues,
  onCopy,
  snippet,
}: {
  isCopying: boolean
  issues: { layerId?: string; message: string }[]
  onCopy: () => Promise<void>
  snippet: string | null
}) {
  const canCopy = Boolean(snippet) && issues.length === 0

  return (
    <section className="flex flex-col gap-[14px]">
      <Typography className="leading-[14px]" tone="muted" variant="caption">
        Install with{" "}
        <code className="rounded-[6px] border border-white/9 bg-white/6 px-[5px] py-px font-[var(--ds-font-mono)] text-[11px]">
          bun add @basementstudio/shader-lab three
        </code>
        , then paste this component into your React app.
      </Typography>

      {issues.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-[var(--ds-radius-panel)] border border-[rgb(255_74_74_/_0.14)] bg-[rgb(255_74_74_/_0.06)] p-3">
          {issues.map((issue) => (
            <Typography
              key={`${issue.layerId ?? "global"}:${issue.message}`}
              variant="caption"
            >
              {issue.message}
            </Typography>
          ))}
        </div>
      ) : null}

      <FieldLabel label="Snippet">
        <pre className="m-0 max-h-[280px] overflow-auto rounded-[var(--ds-radius-panel)] border border-[var(--ds-border-divider)] bg-white/4 p-3 font-[var(--ds-font-mono)] text-[11px] leading-[1.55] whitespace-pre-wrap break-words">
          <code>
            {snippet ?? "// Shader export is blocked for this project."}
          </code>
        </pre>
      </FieldLabel>

      <Button disabled={!canCopy || isCopying} onClick={() => void onCopy()}>
        <CopyIcon size={16} weight="bold" />
        {isCopying ? "Copying..." : "Copy snippet"}
      </Button>
    </section>
  )
}

function FieldLabel({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Typography className="uppercase" tone="secondary" variant="overline">
        {label}
      </Typography>
      {children}
    </div>
  )
}

function PresetRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function PillButton({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-7 items-center justify-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:not-disabled:bg-white/8 hover:not-disabled:border-[var(--ds-border-hover)] disabled:cursor-not-allowed disabled:opacity-42",
        active &&
          "bg-[var(--ds-color-surface-active)] border-[var(--ds-border-active)]"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Typography
        as="span"
        tone={active ? "primary" : "secondary"}
        variant="label"
      >
        {label}
      </Typography>
    </button>
  )
}

function DimensionFields({
  height,
  onHeightChange,
  onWidthChange,
  width,
}: {
  height: number
  onHeightChange: (value: number) => void
  onWidthChange: (value: number) => void
  width: number
}) {
  return (
    <div className="grid gap-[10px] min-[900px]:grid-cols-2">
      <FieldLabel label="Width">
        <NumberInput min={1} onChange={onWidthChange} step={1} value={width} />
      </FieldLabel>
      <FieldLabel label="Height">
        <NumberInput
          min={1}
          onChange={onHeightChange}
          step={1}
          value={height}
        />
      </FieldLabel>
    </div>
  )
}

function NumberInput({
  min,
  onChange,
  step,
  value,
}: {
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <input
      className="min-h-9 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] py-2 font-[var(--ds-font-mono)] text-[12px] leading-4 text-[var(--ds-color-text-primary)]"
      min={min}
      onChange={(event) => {
        const nextValue = Number.parseFloat(event.currentTarget.value)

        if (Number.isFinite(nextValue)) {
          onChange(nextValue)
        }
      }}
      step={step}
      type="number"
      value={value}
    />
  )
}

function buildRenderProjectState() {
  const timelineState = useTimelineStore.getState()
  const editorState = useEditorStore.getState()

  return {
    assets: useAssetStore.getState().assets,
    compositionSize: getEffectiveCompositionSize(
      editorState.sceneConfig,
      editorState.canvasSize
    ),
    layers: useLayerStore.getState().layers,
    sceneConfig: editorState.sceneConfig,
    timeline: {
      currentTime: timelineState.currentTime,
      duration: timelineState.duration,
      isPlaying: timelineState.isPlaying,
      loop: timelineState.loop,
      selectedKeyframeId: timelineState.selectedKeyframeId,
      selectedTrackId: timelineState.selectedTrackId,
      tracks: structuredClone(timelineState.tracks),
    },
  }
}

function getVideoExportDisplaySize(
  format: VideoExportFormat,
  size: { width: number; height: number }
) {
  if (format !== "mp4") {
    return size
  }

  return {
    width: size.width % 2 === 0 ? size.width : Math.max(1, size.width - 1),
    height: size.height % 2 === 0 ? size.height : Math.max(1, size.height - 1),
  }
}

function buildDownloadName(extension: string): string {
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\..+$/, "")
  return `shader-lab-${stamp}.${extension}`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is not available in this browser.")
  }

  await navigator.clipboard.writeText(value)
}
