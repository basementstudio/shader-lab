"use client"

import {
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
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import {
  ASPECT_PRESET_LABELS,
  type ExportAspectPreset,
  type ExportQualityPreset,
  exportStillImage,
  exportVideo,
  getAspectRatioForPreset,
  getDimensionsForPreset,
  getSupportedVideoMimeType,
  type VideoExportFormat,
} from "@/lib/editor/export"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import {
  useAssetStore,
  useEditorStore,
  useLayerStore,
  useTimelineStore,
} from "@/store"
import s from "./editor-export-dialog.module.css"

type ExportTab = "image" | "project" | "video"

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

interface EditorExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditorExportDialog({
  open,
  onOpenChange,
}: EditorExportDialogProps) {
  const reduceMotion = useReducedMotion() ?? false
  const compositionSize = useEditorStore((state) => state.canvasSize)
  const [activeTab, setActiveTab] = useState<ExportTab>("image")
  const [mounted, setMounted] = useState(false)
  const [isDraggingImport, setIsDraggingImport] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [imageAspect, setImageAspect] = useState<ExportAspectPreset>("original")
  const [imageQuality, setImageQuality] =
    useState<ExportQualityPreset>("standard")
  const [imageSize, setImageSize] = useState(() =>
    getDimensionsForPreset(
      useEditorStore.getState().canvasSize,
      "original",
      "standard"
    )
  )
  const [videoAspect, setVideoAspect] = useState<ExportAspectPreset>("original")
  const [videoQuality, setVideoQuality] =
    useState<ExportQualityPreset>("standard")
  const [videoSize, setVideoSize] = useState(() =>
    getDimensionsForPreset(
      useEditorStore.getState().canvasSize,
      "original",
      "standard"
    )
  )
  const [videoDuration, setVideoDuration] = useState(6)
  const [videoFps, setVideoFps] = useState(30)
  const [videoFormat, setVideoFormat] = useState<VideoExportFormat>("webm")
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)

  const mp4Supported = Boolean(getSupportedVideoMimeType("mp4"))
  const webmSupported = Boolean(getSupportedVideoMimeType("webm"))

  useEffect(() => {
    setMounted(true)
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
      getDimensionsForPreset(compositionSize, imageAspect, imageQuality)
    )
  }, [compositionSize, imageAspect, imageQuality])

  useEffect(() => {
    setVideoSize(
      getDimensionsForPreset(compositionSize, videoAspect, videoQuality)
    )
  }, [compositionSize, videoAspect, videoQuality])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onOpenChange, open])

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

  function updateImageWidth(nextWidth: number) {
    const width = Math.max(1, Math.round(nextWidth))
    const ratio = getAspectRatioForPreset(compositionSize, imageAspect)

    setImageSize({
      height: Math.max(1, Math.round(width / ratio)),
      width,
    })
  }

  function updateImageHeight(nextHeight: number) {
    const height = Math.max(1, Math.round(nextHeight))
    const ratio = getAspectRatioForPreset(compositionSize, imageAspect)

    setImageSize({
      height,
      width: Math.max(1, Math.round(height * ratio)),
    })
  }

  function updateVideoWidth(nextWidth: number) {
    const width = Math.max(1, Math.round(nextWidth))
    const ratio = getAspectRatioForPreset(compositionSize, videoAspect)

    setVideoSize({
      height: Math.max(1, Math.round(width / ratio)),
      width,
    })
  }

  function updateVideoHeight(nextHeight: number) {
    const height = Math.max(1, Math.round(nextHeight))
    const ratio = getAspectRatioForPreset(compositionSize, videoAspect)

    setVideoSize({
      height,
      width: Math.max(1, Math.round(height * ratio)),
    })
  }

  async function handleImageExport() {
    clearFeedback()
    setIsWorking(true)

    try {
      const currentTime = useTimelineStore.getState().currentTime
      const blob = await exportStillImage(buildRenderProjectState(), {
        aspectPreset: imageAspect,
        qualityPreset: imageQuality,
        time: currentTime,
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
      const currentTime = useTimelineStore.getState().currentTime
      const blob = await exportVideo(buildRenderProjectState(), {
        aspectPreset: videoAspect,
        duration: Math.max(0.25, videoDuration),
        format: videoFormat,
        fps: Math.max(1, videoFps),
        qualityPreset: videoQuality,
        startTime: currentTime,
        width: videoSize.width,
        height: videoSize.height,
      })

      downloadBlob(blob, buildDownloadName(videoFormat))
      setStatusMessage(
        `${videoFormat.toUpperCase()} exported at ${videoSize.width}×${videoSize.height}.`
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
        <div className={s.dialogRoot} role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close export dialog"
            className={s.backdrop}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            transition={{
              duration: reduceMotion ? 0.12 : 0.18,
              ease: "easeOut",
            }}
            type="button"
          />

          <div className={s.dialogWrap}>
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              className={s.dialogMotion}
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
                className={s.dialog}
                role="dialog"
                variant="panel"
              >
                <div className={s.dialogHeader}>
                  <Typography as="h2" className={s.dialogTitle} variant="title">
                    Export
                  </Typography>
                  <IconButton
                    aria-label="Close export dialog"
                    className={s.closeButton}
                    onClick={() => onOpenChange(false)}
                    variant="default"
                  >
                    <X size={18} weight="bold" />
                  </IconButton>
                </div>

                <div className={s.tabRow}>
                  {(["image", "video", "project"] as const).map((tab) => (
                    <button
                      className={cn(
                        s.tabButton,
                        activeTab === tab && s.tabButtonActive
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
                  ))}
                </div>

                <motion.div
                  animate={
                    contentHeight === null
                      ? { height: "auto" }
                      : { height: contentHeight }
                  }
                  className={s.dialogBody}
                  transition={
                    reduceMotion
                      ? { duration: 0.12, ease: "easeOut" }
                      : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <div aria-hidden="true" className={s.measureWrap}>
                    <div className={s.measureView} ref={measureRef}>
                      {activeTab === "image" ? (
                        <ImageTabContent
                          imageAspect={imageAspect}
                          imageQuality={imageQuality}
                          imageSize={imageSize}
                          isWorking={isWorking}
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
                          mp4Supported={mp4Supported}
                          onExport={handleVideoExport}
                          onVideoAspectChange={setVideoAspect}
                          onVideoDurationChange={setVideoDuration}
                          onVideoFpsChange={setVideoFps}
                          onVideoFormatChange={setVideoFormat}
                          onVideoHeightChange={updateVideoHeight}
                          onVideoQualityChange={setVideoQuality}
                          onVideoWidthChange={updateVideoWidth}
                          videoAspect={videoAspect}
                          videoDuration={videoDuration}
                          videoFormat={videoFormat}
                          videoFps={videoFps}
                          videoQuality={videoQuality}
                          videoSize={videoSize}
                          webmSupported={webmSupported}
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
                    </div>
                  </div>

                  <div className={s.contentViewport}>
                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        animate={{ opacity: 1 }}
                        className={s.tabPane}
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
                            mp4Supported={mp4Supported}
                            onExport={handleVideoExport}
                            onVideoAspectChange={setVideoAspect}
                            onVideoDurationChange={setVideoDuration}
                            onVideoFpsChange={setVideoFps}
                            onVideoFormatChange={setVideoFormat}
                            onVideoHeightChange={updateVideoHeight}
                            onVideoQualityChange={setVideoQuality}
                            onVideoWidthChange={updateVideoWidth}
                            videoAspect={videoAspect}
                            videoDuration={videoDuration}
                            videoFormat={videoFormat}
                            videoFps={videoFps}
                            videoQuality={videoQuality}
                            videoSize={videoSize}
                            webmSupported={webmSupported}
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
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>

                {errorMessage ? (
                  <Typography className={s.errorMessage} variant="caption">
                    {errorMessage}
                  </Typography>
                ) : null}
                {statusMessage ? (
                  <Typography
                    className={s.statusMessage}
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
  onExport: () => Promise<void>
  onImageAspectChange: (preset: ExportAspectPreset) => void
  onImageHeightChange: (value: number) => void
  onImageQualityChange: (preset: ExportQualityPreset) => void
  onImageWidthChange: (value: number) => void
}) {
  return (
    <section className={s.sectionStack}>
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

      <Typography className={s.note} tone="muted" variant="caption">
        Uses the current playhead frame.
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
  videoQuality,
  videoSize,
  webmSupported,
}: {
  isWorking: boolean
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
  videoQuality: ExportQualityPreset
  videoSize: { height: number; width: number }
  webmSupported: boolean
}) {
  return (
    <section className={s.sectionStack}>
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

      <div className={s.inlineGrid}>
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

      <Typography className={s.note} tone="muted" variant="caption">
        Starts from the current playhead position.
      </Typography>

      <Button
        disabled={isWorking || !getSupportedVideoMimeType(videoFormat)}
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
    <section className={s.sectionStack}>
      <Button disabled={isWorking} onClick={() => void onExport()}>
        <FileArrowDownIcon size={16} weight="bold" />
        Export .lab file
      </Button>

      <label
        className={cn(s.dropZone, isDraggingImport && s.dropZoneActive)}
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
          <Typography className={s.dropTitle} variant="label">
            Import .lab configuration
          </Typography>
          <Typography className={s.dropText} tone="tertiary" variant="caption">
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

function FieldLabel({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className={s.field}>
      <Typography className={s.fieldLabel} tone="secondary" variant="overline">
        {label}
      </Typography>
      {children}
    </div>
  )
}

function PresetRow({ children }: { children: ReactNode }) {
  return <div className={s.presetRow}>{children}</div>
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
      className={cn(s.pillButton, active && s.pillButtonActive)}
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
    <div className={s.inlineGrid}>
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
      className={s.numberInput}
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

  return {
    assets: useAssetStore.getState().assets,
    compositionSize: useEditorStore.getState().canvasSize,
    layers: useLayerStore.getState().layers,
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
