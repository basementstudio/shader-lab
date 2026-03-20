"use client"

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  DownloadSimple,
  FileArrowDown,
  Minus,
  Plus,
  UploadSimple,
  X,
} from "@phosphor-icons/react"
import { createPortal } from "react-dom"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
  buildEditorHistorySnapshotFromState,
  getHistorySnapshotSignature,
} from "@/features/editor/utils/history"
import {
  ASPECT_PRESET_LABELS,
  exportStillImage,
  exportVideo,
  getAspectRatioForPreset,
  getDimensionsForPreset,
  getSupportedVideoMimeType,
  type ExportAspectPreset,
  type ExportQualityPreset,
  type VideoExportFormat,
} from "@/features/editor/utils/export"
import { applyLabProjectFile, buildLabProjectFile, parseLabProjectFile } from "@/features/editor/utils/project-file"
import { applyZoomAtPoint, getNextZoomStep } from "@/features/editor/utils/view-transform"
import { cn } from "@/shared/lib/cn"
import { Button } from "@/shared/ui/button"
import { GlassPanel } from "@/shared/ui/glass-panel"
import { IconButton } from "@/shared/ui/icon-button"
import { registerHistoryShortcuts, useAssetStore, useEditorStore, useHistoryStore, useLayerStore, useTimelineStore } from "@/store"
import s from "./editor-topbar.module.css"

type ExportTab = "image" | "project" | "video"

const QUALITY_LABELS: Record<ExportQualityPreset, string> = {
  draft: "Draft",
  high: "High",
  standard: "Standard",
  ultra: "Ultra",
}

const ASPECT_PRESETS: ExportAspectPreset[] = ["original", "1:1", "4:5", "16:9", "9:16"]
const QUALITY_PRESETS: ExportQualityPreset[] = ["draft", "standard", "high", "ultra"]
const VIDEO_FPS_PRESETS = [24, 30, 60] as const
const HISTORY_COMMIT_DEBOUNCE_MS = 220

export function EditorTopBar() {
  const zoom = useEditorStore((state) => state.zoom)
  const panOffset = useEditorStore((state) => state.panOffset)
  const compositionSize = useEditorStore((state) => state.canvasSize)
  const setPan = useEditorStore((state) => state.setPan)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetView = useEditorStore((state) => state.resetView)
  const layers = useLayerStore((state) => state.layers)
  const historyPastLength = useHistoryStore((state) => state.past.length)
  const historyFutureLength = useHistoryStore((state) => state.future.length)
  const pushSnapshot = useHistoryStore((state) => state.pushSnapshot)
  const redo = useHistoryStore((state) => state.redo)
  const undo = useHistoryStore((state) => state.undo)

  const [activeTab, setActiveTab] = useState<ExportTab>("image")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isDraggingImport, setIsDraggingImport] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState<ExportAspectPreset>("original")
  const [imageQuality, setImageQuality] = useState<ExportQualityPreset>("standard")
  const [imageSize, setImageSize] = useState(() =>
    getDimensionsForPreset(useEditorStore.getState().canvasSize, "original", "standard"),
  )
  const [videoAspect, setVideoAspect] = useState<ExportAspectPreset>("original")
  const [videoQuality, setVideoQuality] = useState<ExportQualityPreset>("standard")
  const [videoSize, setVideoSize] = useState(() =>
    getDimensionsForPreset(useEditorStore.getState().canvasSize, "original", "standard"),
  )
  const [videoDuration, setVideoDuration] = useState(6)
  const [videoFps, setVideoFps] = useState(30)
  const [videoFormat, setVideoFormat] = useState<VideoExportFormat>("webm")
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const applyingHistoryRef = useRef(false)
  const committedSnapshotRef = useRef(buildEditorHistorySnapshot())
  const pendingBaseSnapshotRef = useRef<ReturnType<typeof buildEditorHistorySnapshot> | null>(
    null,
  )
  const latestSnapshotRef = useRef(buildEditorHistorySnapshot())
  const historyTimerRef = useRef<number | null>(null)

  const canUndo = historyPastLength > 0
  const canRedo = historyFutureLength > 0
  const mp4Supported = Boolean(getSupportedVideoMimeType("mp4"))
  const webmSupported = Boolean(getSupportedVideoMimeType("webm"))

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setImageSize(getDimensionsForPreset(compositionSize, imageAspect, imageQuality))
  }, [compositionSize, imageAspect, imageQuality])

  useEffect(() => {
    setVideoSize(getDimensionsForPreset(compositionSize, videoAspect, videoQuality))
  }, [compositionSize, videoAspect, videoQuality])

  const clearFeedback = useCallback(() => {
    setErrorMessage(null)
    setStatusMessage(null)
  }, [])

  const flushPendingHistory = useCallback(() => {
    if (!(pendingBaseSnapshotRef.current && latestSnapshotRef.current)) {
      return
    }

    if (
      getHistorySnapshotSignature(pendingBaseSnapshotRef.current) ===
      getHistorySnapshotSignature(latestSnapshotRef.current)
    ) {
      pendingBaseSnapshotRef.current = null
      committedSnapshotRef.current = latestSnapshotRef.current
      return
    }

    pushSnapshot("Editor change", pendingBaseSnapshotRef.current)
    committedSnapshotRef.current = latestSnapshotRef.current
    pendingBaseSnapshotRef.current = null
  }, [pushSnapshot])

  const scheduleHistoryCommit = useCallback(
    (nextSnapshot: ReturnType<typeof buildEditorHistorySnapshot>) => {
      latestSnapshotRef.current = nextSnapshot

      if (!pendingBaseSnapshotRef.current) {
        pendingBaseSnapshotRef.current = committedSnapshotRef.current
      }

      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current)
      }

      historyTimerRef.current = window.setTimeout(() => {
        flushPendingHistory()
        historyTimerRef.current = null
      }, HISTORY_COMMIT_DEBOUNCE_MS)
    },
    [flushPendingHistory],
  )

  const handleUndo = useCallback(() => {
    flushPendingHistory()
    clearFeedback()
    const currentSnapshot = buildEditorHistorySnapshot()
    const previousSnapshot = undo(currentSnapshot)

    if (!previousSnapshot) {
      return
    }

    applyingHistoryRef.current = true
    applyEditorHistorySnapshot(previousSnapshot)
    committedSnapshotRef.current = buildEditorHistorySnapshot()
    latestSnapshotRef.current = committedSnapshotRef.current
    pendingBaseSnapshotRef.current = null
    applyingHistoryRef.current = false
  }, [clearFeedback, flushPendingHistory, undo])

  const handleRedo = useCallback(() => {
    flushPendingHistory()
    clearFeedback()
    const currentSnapshot = buildEditorHistorySnapshot()
    const nextSnapshot = redo(currentSnapshot)

    if (!nextSnapshot) {
      return
    }

    applyingHistoryRef.current = true
    applyEditorHistorySnapshot(nextSnapshot)
    committedSnapshotRef.current = buildEditorHistorySnapshot()
    latestSnapshotRef.current = committedSnapshotRef.current
    pendingBaseSnapshotRef.current = null
    applyingHistoryRef.current = false
  }, [clearFeedback, flushPendingHistory, redo])

  useEffect(() => {
    const unregisterShortcuts = registerHistoryShortcuts(handleUndo, handleRedo)
    const unsubscribeLayers = useLayerStore.subscribe((state, previousState) => {
      if (applyingHistoryRef.current) {
        const snapshot = buildEditorHistorySnapshot()
        committedSnapshotRef.current = snapshot
        latestSnapshotRef.current = snapshot
        return
      }

      const previousSnapshot = buildEditorHistorySnapshotFromState(
        previousState,
        useTimelineStore.getState(),
      )
      const nextSnapshot = buildEditorHistorySnapshotFromState(
        state,
        useTimelineStore.getState(),
      )

      if (
        getHistorySnapshotSignature(previousSnapshot) ===
        getHistorySnapshotSignature(nextSnapshot)
      ) {
        return
      }

      scheduleHistoryCommit(nextSnapshot)
    })

    const unsubscribeTimeline = useTimelineStore.subscribe((state, previousState) => {
      if (applyingHistoryRef.current) {
        const snapshot = buildEditorHistorySnapshot()
        committedSnapshotRef.current = snapshot
        latestSnapshotRef.current = snapshot
        return
      }

      const previousSnapshot = buildEditorHistorySnapshotFromState(
        useLayerStore.getState(),
        previousState,
      )
      const nextSnapshot = buildEditorHistorySnapshotFromState(
        useLayerStore.getState(),
        state,
      )

      if (
        getHistorySnapshotSignature(previousSnapshot) ===
        getHistorySnapshotSignature(nextSnapshot)
      ) {
        return
      }

      scheduleHistoryCommit(nextSnapshot)
    })

    return () => {
      unregisterShortcuts()
      unsubscribeLayers()
      unsubscribeTimeline()

      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current)
      }
    }
  }, [handleRedo, handleUndo, scheduleHistoryCommit])

  useEffect(() => {
    if (!dialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialogOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [dialogOpen])

  function applyZoomStep(direction: "in" | "out") {
    const nextZoom = getNextZoomStep(zoom, direction)
    const nextState = applyZoomAtPoint(zoom, panOffset, { x: 0, y: 0 }, nextZoom)
    setZoom(nextState.zoom)
    setPan(nextState.panOffset.x, nextState.panOffset.y)
  }

  function resetZoom() {
    resetView()
  }

  const buildRenderProjectState = useCallback(() => {
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
  }, [])

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
      setStatusMessage(`PNG exported at ${imageSize.width}×${imageSize.height}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Image export failed.")
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
        `${videoFormat.toUpperCase()} exported at ${videoSize.width}×${videoSize.height}.`,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Video export failed.")
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
      setErrorMessage(error instanceof Error ? error.message : "Project export failed.")
    }
  }

  async function handleProjectImport(file: File) {
    clearFeedback()
    setIsWorking(true)

    try {
      const timelineState = useTimelineStore.getState()
      const hasExistingProject = layers.length > 0 || timelineState.tracks.length > 0

      if (
        hasExistingProject &&
        !window.confirm("Replace the current project with the imported `.lab` file?")
      ) {
        setIsWorking(false)
        return
      }

      const input = await file.text()
      const projectFile = parseLabProjectFile(input)
      const result = applyLabProjectFile(projectFile, useAssetStore.getState().assets)

      setStatusMessage(
        result.missingAssetCount > 0
          ? `Project imported. ${result.missingAssetCount} media layer(s) need relinking.`
          : "Project imported.",
      )
      setDialogOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Project import failed.")
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

  return (
    <>
      <div className={s.root}>
        <GlassPanel className={s.bar} variant="panel">
          <div className={s.group}>
            <IconButton
              aria-label="Undo"
              className={s.controlButton}
              disabled={!canUndo}
              onClick={handleUndo}
              variant="default"
            >
              <ArrowCounterClockwise size={18} weight="bold" />
            </IconButton>
            <IconButton
              aria-label="Redo"
              className={s.controlButton}
              disabled={!canRedo}
              onClick={handleRedo}
              variant="default"
            >
              <ArrowClockwise size={18} weight="bold" />
            </IconButton>
          </div>

          <div className={s.group}>
            <IconButton
              aria-label="Zoom out"
              className={s.controlButton}
              onClick={() => applyZoomStep("out")}
              variant="default"
            >
              <Minus size={18} weight="bold" />
            </IconButton>
            <button className={s.zoomReadout} onClick={resetZoom} type="button">
              {Math.round(zoom * 100)}%
            </button>
            <IconButton
              aria-label="Zoom in"
              className={s.controlButton}
              onClick={() => applyZoomStep("in")}
              variant="default"
            >
              <Plus size={18} weight="bold" />
            </IconButton>
            <span aria-hidden="true" className={s.divider} />
            <Button className={s.exportButton} onClick={() => setDialogOpen(true)} size="compact">
              <DownloadSimple size={16} weight="bold" />
              Export
            </Button>
          </div>
        </GlassPanel>
      </div>

      {mounted && dialogOpen
        ? createPortal(
            <div className={s.dialogRoot} role="presentation">
              <button
                aria-label="Close export dialog"
                className={s.backdrop}
                onClick={() => setDialogOpen(false)}
                type="button"
              />

              <GlassPanel
                aria-modal="true"
                className={s.dialog}
                role="dialog"
                variant="panel"
              >
                <div className={s.dialogHeader}>
                  <div>
                    <p className={s.eyebrow}>Shader Lab</p>
                    <h2 className={s.dialogTitle}>Export</h2>
                  </div>
                  <IconButton
                    aria-label="Close export dialog"
                    className={s.closeButton}
                    onClick={() => setDialogOpen(false)}
                    variant="default"
                  >
                    <X size={18} weight="bold" />
                  </IconButton>
                </div>

                <div className={s.tabRow}>
                  {(["image", "video", "project"] as const).map((tab) => (
                    <button
                      className={cn(s.tabButton, activeTab === tab && s.tabButtonActive)}
                      key={tab}
                      onClick={() => {
                        clearFeedback()
                        setActiveTab(tab)
                      }}
                      type="button"
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className={s.dialogBody}>
                  {activeTab === "image" ? (
                    <section className={s.sectionStack}>
                      <FieldLabel label="Aspect">
                        <PresetRow>
                          {ASPECT_PRESETS.map((preset) => (
                            <PillButton
                              active={imageAspect === preset}
                              key={preset}
                              label={ASPECT_PRESET_LABELS[preset]}
                              onClick={() => setImageAspect(preset)}
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
                              onClick={() => setImageQuality(preset)}
                            />
                          ))}
                        </PresetRow>
                      </FieldLabel>

                      <DimensionFields
                        height={imageSize.height}
                        onHeightChange={updateImageHeight}
                        onWidthChange={updateImageWidth}
                        width={imageSize.width}
                      />

                      <p className={s.note}>Uses the current playhead frame.</p>

                      <Button disabled={isWorking} onClick={() => void handleImageExport()}>
                        <FileArrowDown size={16} weight="bold" />
                        Export PNG
                      </Button>
                    </section>
                  ) : null}

                  {activeTab === "video" ? (
                    <section className={s.sectionStack}>
                      <FieldLabel label="Format">
                        <PresetRow>
                          <PillButton
                            active={videoFormat === "webm"}
                            disabled={!webmSupported}
                            label="WebM"
                            onClick={() => setVideoFormat("webm")}
                          />
                          <PillButton
                            active={videoFormat === "mp4"}
                            disabled={!mp4Supported}
                            label="MP4"
                            onClick={() => setVideoFormat("mp4")}
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
                              onClick={() => setVideoAspect(preset)}
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
                              onClick={() => setVideoQuality(preset)}
                            />
                          ))}
                        </PresetRow>
                      </FieldLabel>

                      <DimensionFields
                        height={videoSize.height}
                        onHeightChange={updateVideoHeight}
                        onWidthChange={updateVideoWidth}
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
                                onClick={() => setVideoFps(fps)}
                              />
                            ))}
                          </PresetRow>
                        </FieldLabel>

                        <FieldLabel label="Duration">
                          <NumberInput
                            min={0.25}
                            onChange={(value) => setVideoDuration(value)}
                            step={0.25}
                            value={videoDuration}
                          />
                        </FieldLabel>
                      </div>

                      <p className={s.note}>Starts from the current playhead position.</p>

                      <Button
                        disabled={isWorking || !getSupportedVideoMimeType(videoFormat)}
                        onClick={() => void handleVideoExport()}
                      >
                        <FileArrowDown size={16} weight="bold" />
                        Export {videoFormat.toUpperCase()}
                      </Button>
                    </section>
                  ) : null}

                  {activeTab === "project" ? (
                    <section className={s.sectionStack}>
                      <Button disabled={isWorking} onClick={() => void handleProjectExport()}>
                        <FileArrowDown size={16} weight="bold" />
                        Export `.lab`
                      </Button>

                      <label
                        className={cn(s.dropZone, isDraggingImport && s.dropZoneActive)}
                        onDragEnter={() => setIsDraggingImport(true)}
                        onDragLeave={() => setIsDraggingImport(false)}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (!isDraggingImport) {
                            setIsDraggingImport(true)
                          }
                        }}
                        onDrop={handleDrop}
                      >
                        <input
                          accept=".lab,application/json"
                          className="hidden"
                          onChange={handleImportChange}
                          ref={importInputRef}
                          type="file"
                        />

                        <UploadSimple size={20} weight="bold" />
                        <div>
                          <p className={s.dropTitle}>Import `.lab`</p>
                          <p className={s.dropText}>
                            Drop a project file here or browse to replace the current project.
                          </p>
                        </div>

                        <Button
                          disabled={isWorking}
                          onClick={(event) => {
                            event.preventDefault()
                            importInputRef.current?.click()
                          }}
                          size="compact"
                          variant="secondary"
                        >
                          Browse
                        </Button>
                      </label>
                    </section>
                  ) : null}
                </div>

                {errorMessage ? <p className={s.errorMessage}>{errorMessage}</p> : null}
                {statusMessage ? <p className={s.statusMessage}>{statusMessage}</p> : null}
              </GlassPanel>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function FieldLabel({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className={s.field}>
      <p className={s.fieldLabel}>{label}</p>
      {children}
    </div>
  )
}

function PresetRow({ children }: { children: React.ReactNode }) {
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
      {label}
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
        <NumberInput min={1} onChange={onHeightChange} step={1} value={height} />
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

function buildDownloadName(extension: string): string {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\..+$/, "")
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
