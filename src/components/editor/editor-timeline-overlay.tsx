"use client"

import { Select as BaseSelect } from "@base-ui/react/select"
import {
  CaretDownIcon,
  CaretUpIcon,
  CircleIcon,
  CommitIcon,
  DotFilledIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from "@radix-ui/react-icons"
import { motion, useReducedMotion } from "motion/react"
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { NumberInput } from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { getLongestVideoLayerDuration } from "@/lib/editor/timeline-duration"
import { useEditorStore, useLayerStore, useTimelineStore } from "@/store"
import { useAssetStore } from "@/store/asset-store"
import {
  createLayerPropertyBinding,
  createParamBinding,
} from "@/store/timeline-store"
import type {
  AnimatedPropertyBinding,
  EditorLayer,
  ParameterDefinition,
  TimelineInterpolation,
  TimelineTrack,
} from "@/types/editor"
import { TIMELINE_INTERPOLATIONS } from "@/types/editor"

type TimelinePropertyItem = {
  binding: AnimatedPropertyBinding
  color: string
  id: string
  kind: "layer" | "param"
  label: string
  track: TimelineTrack | null
}

type DragState =
  | {
      type: "keyframe"
      keyframeId: string
      trackId: string
    }
  | {
      type: "playhead"
    }

const GENERAL_TIMELINE_PROPERTIES = [
  { color: "#8DB1FF", property: "opacity" },
  { color: "#A4E0A0", property: "hue" },
  { color: "#F7B365", property: "saturation" },
] as const

const COLLAPSED_SHELL_HEIGHT = 52
const COLLAPSED_SHELL_WIDTH = 580
const EXPANDED_SHELL_HEIGHT = 380
const EXPANDED_SHELL_WIDTH = 820
const INTERPOLATION_OPTIONS = TIMELINE_INTERPOLATIONS.map((value) => ({
  label: value[0]?.toUpperCase() + value.slice(1),
  value,
}))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatSeconds(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}s`
}

function hexToRgbChannels(value: string): string {
  const normalized = value.replace("#", "")

  if (normalized.length !== 6) {
    return "122 162 255"
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `${red} ${green} ${blue}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

function getPropertyId(binding: AnimatedPropertyBinding): string {
  if (binding.kind === "layer") {
    return `layer:${binding.property}`
  }

  return `param:${binding.key}`
}

function getVisibleParams(layer: EditorLayer): ParameterDefinition[] {
  const definition = getLayerDefinition(layer.type)

  return definition.params.filter((entry) => {
    if (!entry.visibleWhen) {
      return true
    }

    const controllingValue =
      layer.params[entry.visibleWhen.key] ??
      definition.params.find((param) => param.key === entry.visibleWhen?.key)
        ?.defaultValue

    if ("equals" in entry.visibleWhen) {
      return controllingValue === entry.visibleWhen.equals
    }

    return (
      typeof controllingValue === "number" &&
      controllingValue >= entry.visibleWhen.gte
    )
  })
}

function buildTimelineProperties(
  layer: EditorLayer | null,
  tracks: TimelineTrack[]
): TimelinePropertyItem[] {
  if (!layer) {
    return []
  }

  const properties: TimelinePropertyItem[] = GENERAL_TIMELINE_PROPERTIES.map(
    (entry) => {
      const binding = createLayerPropertyBinding(entry.property)
      const id = getPropertyId(binding)

      return {
        binding,
        color: entry.color,
        id,
        kind: "layer",
        label: binding.label,
        track:
          tracks.find(
            (track) =>
              track.layerId === layer.id && getPropertyId(track.binding) === id
          ) ?? null,
      }
    }
  )

  for (const definition of getVisibleParams(layer)) {
    const binding = createParamBinding(layer, definition.key)

    if (!binding) {
      continue
    }

    const id = getPropertyId(binding)
    properties.push({
      binding,
      color: definition.type === "color" ? "#FF8CAB" : "#B697FF",
      id,
      kind: "param",
      label: definition.label,
      track:
        tracks.find(
          (track) =>
            track.layerId === layer.id && getPropertyId(track.binding) === id
        ) ?? null,
    })
  }

  return properties
}

function getMajorTickStep(duration: number): number {
  if (duration <= 6) {
    return 1
  }

  if (duration <= 12) {
    return 2
  }

  if (duration <= 30) {
    return 5
  }

  if (duration <= 60) {
    return 10
  }

  return 20
}

function createTickPositions(duration: number) {
  const safeDuration = Math.max(duration, 0.25)
  const majorStep = getMajorTickStep(safeDuration)
  const minorStep = majorStep / 4
  const majorTicks: number[] = []
  const minorTicks: number[] = []

  for (
    let current = 0;
    current <= safeDuration + Number.EPSILON;
    current += majorStep
  ) {
    majorTicks.push(Number(current.toFixed(3)))
  }

  if (majorTicks[majorTicks.length - 1] !== safeDuration) {
    majorTicks.push(safeDuration)
  }

  for (
    let current = 0;
    current <= safeDuration + Number.EPSILON;
    current += minorStep
  ) {
    const normalized = Number(current.toFixed(3))
    if (!majorTicks.some((tick) => Math.abs(tick - normalized) < 0.001)) {
      minorTicks.push(normalized)
    }
  }

  return { majorTicks, minorTicks }
}

function TimelineTransport({
  autoKey,
  currentTime,
  duration,
  durationReadOnly,
  expanded,
  isPlaying,
  loop,
  onDurationChange,
  onStop,
  onToggleAutoKey,
  onToggleExpanded,
  onToggleLoop,
  onTogglePlaying,
}: {
  autoKey: boolean
  currentTime: number
  duration: number
  durationReadOnly: boolean
  expanded: boolean
  isPlaying: boolean
  loop: boolean
  onDurationChange: (value: number) => void
  onStop: () => void
  onToggleAutoKey: () => void
  onToggleExpanded: () => void
  onToggleLoop: () => void
  onTogglePlaying: () => void
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2",
        expanded ? "min-h-[31px]" : "min-h-7"
      )}
    >
      <div className="inline-flex items-center gap-1">
        <IconButton
          aria-label={isPlaying ? "Pause playback" : "Play timeline"}
          className="h-7 w-7"
          onClick={onTogglePlaying}
          variant="default"
        >
          {isPlaying ? (
            <PauseIcon height={14} width={14} />
          ) : (
            <PlayIcon height={14} width={14} />
          )}
        </IconButton>
        <IconButton
          aria-label="Stop playback"
          className="h-7 w-7"
          onClick={onStop}
          variant="default"
        >
          <StopIcon height={14} width={14} />
        </IconButton>
        <IconButton
          aria-label={loop ? "Disable loop" : "Enable loop"}
          className={cn(
            "h-7 w-7",
            loop && "bg-white/12 text-[var(--ds-color-text-primary)]"
          )}
          onClick={onToggleLoop}
          variant={loop ? "active" : "default"}
        >
          <LoopIcon height={14} width={14} />
        </IconButton>
      </div>

      <span
        aria-hidden="true"
        className="block h-4 w-px shrink-0 rounded-full bg-[var(--ds-border-divider)]"
      />

      <div className="inline-flex items-center gap-1">
        <IconButton
          aria-label={autoKey ? "Disable auto-key" : "Enable auto-key"}
          className={cn(
            "h-7 w-auto gap-1.5 px-[10px]",
            autoKey && "bg-white/12 text-[var(--ds-color-text-primary)]"
          )}
          onClick={onToggleAutoKey}
          variant={autoKey ? "active" : "default"}
        >
          {autoKey ? (
            <DotFilledIcon height={10} width={10} />
          ) : (
            <CircleIcon height={10} width={10} />
          )}
          <Typography as="span" tone="secondary" variant="monoSm">
            Auto-Key
          </Typography>
        </IconButton>
      </div>

      <span
        aria-hidden="true"
        className="block h-4 w-px shrink-0 rounded-full bg-[var(--ds-border-divider)]"
      />

      <div className="inline-flex items-center gap-2">
        <Typography as="span" tone="secondary" variant="monoSm">
          Dur
        </Typography>
        <NumberInput
          aria-label="Timeline duration in seconds"
          size={2}
          className={cn(
            "min-h-7 appearance-none rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] text-center font-[var(--ds-font-mono)] text-[12px] leading-4 text-[var(--ds-color-text-primary)] outline-none transition-[background-color,border-color] duration-160 ease-[var(--ease-out-cubic)] focus:border-[var(--ds-border-hover)]",
            durationReadOnly && "cursor-not-allowed text-white/55 opacity-60"
          )}
          disabled={durationReadOnly}
          formatValue={(value) =>
            durationReadOnly ? value.toFixed(2) : Math.trunc(value).toString()
          }
          max={120}
          min={1}
          onChange={onDurationChange}
          parseValue={(value) => {
            const nextValue = Number.parseFloat(
              value.trim().replaceAll(",", ".")
            )
            return Number.isFinite(nextValue) ? Math.trunc(nextValue) : null
          }}
          step={1}
          value={duration}
        />
        <Typography
          as="span"
          className="whitespace-nowrap"
          tone="secondary"
          variant="monoSm"
        >
          sec
        </Typography>
      </div>

      <div className="inline-flex min-w-0 flex-1 items-center justify-end gap-1">
        <Typography
          as="span"
          className="min-w-[104px] whitespace-nowrap text-right"
          tone="secondary"
          variant="monoMd"
        >
          {formatSeconds(currentTime)} / {formatSeconds(duration)}
        </Typography>
        <IconButton
          aria-label={
            expanded ? "Collapse timeline panel" : "Expand timeline panel"
          }
          className="h-7 w-7"
          onClick={onToggleExpanded}
          variant="default"
        >
          {expanded ? (
            <CaretDownIcon height={14} width={14} />
          ) : (
            <CaretUpIcon height={14} width={14} />
          )}
        </IconButton>
      </div>
    </div>
  )
}

export function EditorTimelineOverlay() {
  const reduceMotion = useReducedMotion() ?? false
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const timelineAutoKey = useEditorStore((state) => state.timelineAutoKey)
  const closeTimelinePanel = useEditorStore((state) => state.closeTimelinePanel)
  const toggleTimelineAutoKey = useEditorStore(
    (state) => state.toggleTimelineAutoKey
  )
  const toggleTimelinePanel = useEditorStore(
    (state) => state.toggleTimelinePanel
  )
  const assets = useAssetStore((state) => state.assets)
  const layers = useLayerStore((state) => state.layers)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const selectedLayer = useMemo(
    () =>
      selectedLayerId
        ? (layers.find((layer) => layer.id === selectedLayerId) ?? null)
        : null,
    [layers, selectedLayerId]
  )

  const currentTime = useTimelineStore((state) => state.currentTime)
  const duration = useTimelineStore((state) => state.duration)
  const isPlaying = useTimelineStore((state) => state.isPlaying)
  const loop = useTimelineStore((state) => state.loop)
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId)
  const selectedKeyframeId = useTimelineStore(
    (state) => state.selectedKeyframeId
  )
  const tracks = useTimelineStore((state) => state.tracks)
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime)
  const setDuration = useTimelineStore((state) => state.setDuration)
  const setLoop = useTimelineStore((state) => state.setLoop)
  const setPlaying = useTimelineStore((state) => state.setPlaying)
  const setSelected = useTimelineStore((state) => state.setSelected)
  const setTrackInterpolation = useTimelineStore(
    (state) => state.setTrackInterpolation
  )
  const setKeyframeTime = useTimelineStore((state) => state.setKeyframeTime)
  const removeKeyframe = useTimelineStore((state) => state.removeKeyframe)
  const stop = useTimelineStore((state) => state.stop)
  const togglePlaying = useTimelineStore((state) => state.togglePlaying)
  const derivedVideoDuration = useMemo(
    () => getLongestVideoLayerDuration(layers, assets),
    [assets, layers]
  )
  const hasDerivedVideoDuration = derivedVideoDuration !== null
  const effectiveDuration = derivedVideoDuration ?? duration

  const layerTracks = useMemo(
    () =>
      selectedLayer
        ? tracks.filter((track) => track.layerId === selectedLayer.id)
        : [],
    [selectedLayer, tracks]
  )
  const properties = useMemo(
    () => buildTimelineProperties(selectedLayer, tracks),
    [selectedLayer, tracks]
  )
  const animatedProperties = useMemo(
    () => properties.filter((entry) => entry.track),
    [properties]
  )
  const [focusedPropertyId, setFocusedPropertyId] = useState<string | null>(
    null
  )
  const previousHasDerivedVideoDurationRef = useRef<boolean | null>(null)
  const scrubSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [viewportSize, setViewportSize] = useState({ height: 900, width: 1440 })
  const tickPositions = useMemo(
    () => createTickPositions(effectiveDuration),
    [effectiveDuration]
  )

  useEffect(() => {
    if (!(hasDerivedVideoDuration && derivedVideoDuration !== duration)) {
      return
    }

    setDuration(derivedVideoDuration)
  }, [derivedVideoDuration, duration, hasDerivedVideoDuration, setDuration])

  useEffect(() => {
    const previousHasDerivedVideoDuration =
      previousHasDerivedVideoDurationRef.current

    if (
      hasDerivedVideoDuration &&
      previousHasDerivedVideoDuration !== true &&
      !isPlaying
    ) {
      setPlaying(true)
    }

    previousHasDerivedVideoDurationRef.current = hasDerivedVideoDuration
  }, [hasDerivedVideoDuration, isPlaying, setPlaying])

  useEffect(() => {
    if (!(timelinePanelOpen && selectedLayer)) {
      return
    }

    const selectedTrack =
      layerTracks.find((track) => track.id === selectedTrackId) ?? null

    if (selectedTrack) {
      const nextPropertyId = getPropertyId(selectedTrack.binding)
      if (focusedPropertyId !== nextPropertyId) {
        setFocusedPropertyId(nextPropertyId)
      }
      return
    }

    if (
      focusedPropertyId &&
      properties.some((entry) => entry.id === focusedPropertyId)
    ) {
      return
    }

    const firstAnimatedTrack = animatedProperties[0]?.track ?? null

    if (firstAnimatedTrack) {
      setSelected(firstAnimatedTrack.id)
      setFocusedPropertyId(getPropertyId(firstAnimatedTrack.binding))
      return
    }

    setFocusedPropertyId(properties[0]?.id ?? null)
  }, [
    animatedProperties,
    focusedPropertyId,
    layerTracks,
    properties,
    selectedLayer,
    selectedTrackId,
    setSelected,
    timelinePanelOpen,
  ])

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        height: window.innerHeight,
        width: window.innerWidth,
      })
    }

    updateViewportSize()
    window.addEventListener("resize", updateViewportSize)

    return () => {
      window.removeEventListener("resize", updateViewportSize)
    }
  }, [])

  useEffect(() => {
    if (!timelinePanelOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedTrackId &&
        selectedKeyframeId &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        removeKeyframe(selectedTrackId, selectedKeyframeId)
        return
      }

      if (event.key === "Escape") {
        closeTimelinePanel()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    closeTimelinePanel,
    removeKeyframe,
    selectedKeyframeId,
    selectedTrackId,
    timelinePanelOpen,
  ])

  const getTimeFromClientX = useEffectEvent((clientX: number) => {
    const surface = scrubSurfaceRef.current

    if (!surface) {
      return currentTime
    }

    const rect = surface.getBoundingClientRect()
    const progress =
      rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0
    return progress * effectiveDuration
  })

  const handleDragMove = useEffectEvent((event: PointerEvent) => {
    if (!dragState) {
      return
    }

    const nextTime = getTimeFromClientX(event.clientX)

    if (dragState.type === "playhead") {
      setCurrentTime(nextTime)
      return
    }

    setKeyframeTime(dragState.trackId, dragState.keyframeId, nextTime)
  })

  const handleDragEnd = useEffectEvent(() => {
    setDragState(null)
  })

  useEffect(() => {
    if (!dragState) {
      return
    }

    window.addEventListener("pointermove", handleDragMove)
    window.addEventListener("pointerup", handleDragEnd)
    window.addEventListener("pointercancel", handleDragEnd)

    return () => {
      window.removeEventListener("pointermove", handleDragMove)
      window.removeEventListener("pointerup", handleDragEnd)
      window.removeEventListener("pointercancel", handleDragEnd)
    }
  }, [dragState])

  useEffect(() => {
    if (dragState?.type !== "playhead") {
      return
    }

    const previousCursor = document.body.style.cursor
    document.body.style.cursor = "grabbing"

    return () => {
      document.body.style.cursor = previousCursor
    }
  }, [dragState])

  if (immersiveCanvas) {
    return null
  }

  const selectedTrack =
    layerTracks.find((track) => track.id === selectedTrackId) ?? null
  const progress =
    effectiveDuration > 0 ? clamp(currentTime / effectiveDuration, 0, 1) : 0
  const shellWidth = timelinePanelOpen
    ? Math.min(EXPANDED_SHELL_WIDTH, Math.max(640, viewportSize.width - 96))
    : Math.min(COLLAPSED_SHELL_WIDTH, Math.max(360, viewportSize.width - 48))
  const shellHeight = timelinePanelOpen
    ? Math.min(EXPANDED_SHELL_HEIGHT, Math.max(220, viewportSize.height - 268))
    : COLLAPSED_SHELL_HEIGHT
  const expandedBodyHeight = Math.max(0, shellHeight - COLLAPSED_SHELL_HEIGHT)

  const handleScrubStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setCurrentTime(getTimeFromClientX(event.clientX))
    setDragState({ type: "playhead" })
  }

  let panelBodyAnimation: {
    height: number
    opacity: number
    y?: number
  }

  if (timelinePanelOpen) {
    panelBodyAnimation = reduceMotion
      ? { height: expandedBodyHeight, opacity: 1 }
      : { height: expandedBodyHeight, opacity: 1, y: 0 }
  } else {
    panelBodyAnimation = reduceMotion
      ? { height: 0, opacity: 0 }
      : { height: 0, opacity: 0, y: 8 }
  }

  return (
    <FloatingDesktopPanel
      id="timeline"
      resolvePosition={({
        panelHeight,
        panelWidth,
        viewportHeight,
        viewportWidth,
      }) => ({
        left: Math.max(12, (viewportWidth - panelWidth) / 2),
        top: Math.max(12, viewportHeight - panelHeight - 12),
      })}
    >
      {({ suppressResize: _suppressResize }) => (
        <motion.div
          animate={
            reduceMotion
              ? { height: shellHeight, opacity: 1, width: shellWidth }
              : { height: shellHeight, opacity: 1, width: shellWidth, y: 0 }
          }
          className="pointer-events-auto max-h-[min(380px,calc(100vh-268px))] origin-bottom"
          initial={false}
          transition={
            reduceMotion
              ? { duration: 0.14, ease: "easeOut" }
              : {
                  damping: 34,
                  mass: 0.95,
                  stiffness: 280,
                  type: "spring",
                }
          }
        >
          <GlassPanel
            className="pointer-events-auto flex h-full max-h-inherit w-full flex-col overflow-hidden"
            variant="panel"
          >
            <div
              className={cn(
                "border-b border-[var(--ds-border-divider)] p-2 transition-[border-color] duration-160 ease-[var(--ease-out-cubic)]",
                !timelinePanelOpen && "border-b-transparent"
              )}
            >
              <TimelineTransport
                autoKey={timelineAutoKey}
                currentTime={currentTime}
                duration={effectiveDuration}
                durationReadOnly={hasDerivedVideoDuration}
                expanded={timelinePanelOpen}
                isPlaying={isPlaying}
                loop={loop}
                onDurationChange={setDuration}
                onStop={stop}
                onToggleAutoKey={toggleTimelineAutoKey}
                onToggleExpanded={toggleTimelinePanel}
                onToggleLoop={() => setLoop(!loop)}
                onTogglePlaying={togglePlaying}
              />
            </div>

            <motion.div
              animate={panelBodyAnimation}
              className="flex min-h-0 flex-1 overflow-hidden"
              initial={false}
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: "easeOut" }
                  : {
                      damping: 34,
                      delay: timelinePanelOpen ? 0.04 : 0,
                      mass: 0.78,
                      stiffness: 320,
                      type: "spring",
                    }
              }
            >
              <div
                aria-hidden={!timelinePanelOpen}
                className={cn(
                  "flex h-full min-h-0 flex-1 overflow-hidden",
                  !timelinePanelOpen && "pointer-events-none"
                )}
              >
                <div className="flex h-full min-h-0 shrink-0 basis-[180px] flex-col gap-4 overflow-y-auto border-r border-[var(--ds-border-divider)] px-3 pt-[10px] pb-3 [scrollbar-gutter:stable]">
                  <div className="flex flex-col gap-[10px]">
                    <Typography
                      className="tracking-[0.08em] uppercase"
                      tone="secondary"
                      variant="overline"
                    >
                      Properties
                    </Typography>

                    <div className="flex flex-col gap-1.5">
                      {properties.length > 0 ? (
                        properties.map((entry) => {
                          const isFocused = focusedPropertyId === entry.id
                          const hasTrack = Boolean(entry.track)

                          return (
                            <button
                              className={cn(
                                "flex min-h-8 cursor-pointer items-center gap-[10px] rounded-[10px] border border-transparent px-[10px] text-left transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/4 hover:border-white/5 active:scale-[0.995]",
                                isFocused && "border-white/8 bg-white/8",
                                hasTrack
                                  ? "text-[var(--ds-color-text-primary)]"
                                  : "text-[var(--ds-color-text-muted)]"
                              )}
                              key={entry.id}
                              onClick={() => {
                                setFocusedPropertyId(entry.id)

                                if (entry.track) {
                                  setSelected(entry.track.id)
                                } else {
                                  setSelected(null)
                                }
                              }}
                              type="button"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_1px_rgb(255_255_255_/_0.08)]"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <Typography
                                  as="span"
                                  className="min-w-0"
                                  tone={hasTrack ? "primary" : "muted"}
                                  variant="monoSm"
                                >
                                  {entry.label}
                                </Typography>
                              </div>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "inline-flex h-[7px] w-[7px] shrink-0 rounded-full",
                                  hasTrack
                                    ? "bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.9)] shadow-[0_0_10px_rgb(var(--timeline-track-rgb,122_162_255)_/_0.35)]"
                                    : "bg-white/14"
                                )}
                                style={
                                  hasTrack
                                    ? ({
                                        "--timeline-track-rgb":
                                          hexToRgbChannels(entry.color),
                                      } as CSSProperties)
                                    : undefined
                                }
                              />
                            </button>
                          )
                        })
                      ) : (
                        <Typography tone="muted" variant="caption">
                          Select a layer to inspect its timeline properties.
                        </Typography>
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <div
                    className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    onPointerDown={handleScrubStart}
                    ref={scrubSurfaceRef}
                  >
                    <div className="relative basis-[30px] border-b border-[var(--ds-border-divider)]">
                      {tickPositions.minorTicks.map((tick) => (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 w-px bg-white/6 h-[10px]"
                          key={`minor-${tick}`}
                          style={{
                            left: `${(tick / effectiveDuration) * 100}%`,
                          }}
                        />
                      ))}

                      {tickPositions.majorTicks.map((tick) => (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 h-[18px] w-px bg-white/14"
                          key={`major-${tick}`}
                          style={{
                            left: `${(tick / effectiveDuration) * 100}%`,
                          }}
                        />
                      ))}

                      {tickPositions.majorTicks.map((tick) => (
                        <Typography
                          as="span"
                          className="absolute top-1 left-0 -translate-x-1/2 whitespace-nowrap"
                          key={`label-${tick}`}
                          tone="muted"
                          variant="monoXs"
                          style={{
                            left: `${(tick / effectiveDuration) * 100}%`,
                          }}
                        >
                          {tick.toFixed(1)}
                        </Typography>
                      ))}
                    </div>

                    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                      {animatedProperties.length > 0 ? (
                        animatedProperties.map((entry) => {
                          const track = entry.track

                          if (!track) {
                            return null
                          }

                          const isFocused = focusedPropertyId === entry.id

                          return (
                            <div
                              className={cn(
                                "relative basis-[46px] border-b border-white/4 bg-[linear-gradient(90deg,rgb(255_255_255_/_0.02)_0%,rgb(255_255_255_/_0.015)_100%)]",
                                isFocused &&
                                  "bg-[linear-gradient(90deg,rgb(var(--timeline-track-rgb,122_162_255)_/_0.12)_0%,rgb(var(--timeline-track-rgb,122_162_255)_/_0.03)_42%,rgb(255_255_255_/_0.02)_100%)]"
                              )}
                              key={track.id}
                              style={
                                {
                                  "--timeline-track-rgb": hexToRgbChannels(
                                    entry.color
                                  ),
                                } as CSSProperties
                              }
                            >
                              <div
                                className={cn(
                                  "absolute top-[22px] right-0 left-0 h-0.5 rounded-full bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.18)]",
                                  !track.enabled && "opacity-40"
                                )}
                              />
                              {track.keyframes.map((keyframe) => (
                                <button
                                  aria-label={`Keyframe at ${formatSeconds(keyframe.time)}`}
                                  className="group absolute top-[11px] inline-flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center bg-transparent p-0 text-inherit cursor-grab active:cursor-grabbing"
                                  data-selected={
                                    selectedKeyframeId === keyframe.id
                                  }
                                  key={keyframe.id}
                                  onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setFocusedPropertyId(entry.id)
                                    setSelected(track.id, keyframe.id)
                                    setDragState({
                                      keyframeId: keyframe.id,
                                      trackId: track.id,
                                      type: "keyframe",
                                    })
                                  }}
                                  style={{
                                    left: `${(keyframe.time / effectiveDuration) * 100}%`,
                                  }}
                                  type="button"
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "h-[11px] w-[11px] rounded-[4px] border border-white/40 bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.95)] shadow-[0_4px_10px_rgb(0_0_0_/_0.22)] rotate-45 transition-[box-shadow,transform] duration-160 ease-[var(--ease-out-cubic)] group-hover:shadow-[0_0_0_1px_rgb(255_255_255_/_0.24),0_6px_14px_rgb(0_0_0_/_0.28)]",
                                      selectedKeyframeId === keyframe.id &&
                                        "bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_1)] scale-[1.12]"
                                    )}
                                  />
                                </button>
                              ))}
                            </div>
                          )
                        })
                      ) : (
                        <div className="pointer-events-none absolute inset-x-0 top-[30px] flex items-start justify-center">
                          <div className="flex max-w-[320px] flex-col gap-1.5 px-[18px] py-4 text-center">
                            <Typography
                              align="center"
                              variant="caption"
                              className="text-balance"
                            >
                              Add your first keyframe from the properties panel.
                            </Typography>
                          </div>
                        </div>
                      )}

                      <div
                        className={cn(
                          "pointer-events-none absolute top-0 bottom-0 w-0 -translate-x-1/2",
                          dragState?.type === "playhead" &&
                            "[&_div[aria-hidden='true']]:cursor-grabbing"
                        )}
                        style={{ left: `${progress * 100}%` }}
                      >
                        <div
                          aria-hidden="true"
                          className="pointer-events-auto absolute top-0 left-1/2 h-[14px] w-[14px] -translate-x-1/2 cursor-grab rounded-[4px] bg-white/96 shadow-[0_8px_18px_rgb(0_0_0_/_0.28)] active:cursor-grabbing"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setDragState({ type: "playhead" })
                          }}
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-auto absolute top-3 bottom-0 left-1/2 w-px -translate-x-1/2 cursor-grab bg-[linear-gradient(180deg,rgb(255_255_255_/_0.95)_0%,rgb(255_255_255_/_0.62)_100%)] active:cursor-grabbing"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setDragState({ type: "playhead" })
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {selectedTrack ? (
                    <div
                      className="pointer-events-auto absolute right-3 bottom-3 z-4 inline-flex"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                    >
                      <BaseSelect.Root
                        items={INTERPOLATION_OPTIONS}
                        modal={false}
                        onValueChange={(value) => {
                          if (value) {
                            setTrackInterpolation(
                              selectedTrack.id,
                              value as TimelineInterpolation
                            )
                          }
                        }}
                        value={selectedTrack.interpolation}
                      >
                        <BaseSelect.Trigger
                          aria-label="Track easing"
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.96] data-[popup-open]:bg-white/8 data-[popup-open]:border-[var(--ds-border-hover)] data-[popup-open]:text-[var(--ds-color-text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-border-active)]"
                          onPointerDown={(event) => {
                            event.stopPropagation()
                          }}
                        >
                          <CommitIcon height={14} width={14} />
                        </BaseSelect.Trigger>

                        <BaseSelect.Portal>
                          <BaseSelect.Positioner
                            align="end"
                            alignItemWithTrigger={false}
                            className="z-50 outline-none"
                            side="top"
                            sideOffset={10}
                          >
                            <BaseSelect.Popup className="min-w-[132px] overflow-hidden rounded-[12px] border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.82)] shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[24px]">
                              <BaseSelect.List className="flex flex-col gap-0.5 p-1">
                                {INTERPOLATION_OPTIONS.map((option) => (
                                  <BaseSelect.Item
                                    className="cursor-pointer rounded-[var(--ds-radius-icon)] px-[10px] py-[6px] text-[var(--ds-color-text-secondary)] outline-none transition-[background-color,color] duration-140 ease-[var(--ease-out-cubic)] data-[highlighted]:bg-[var(--ds-color-surface-active)] data-[selected]:bg-[var(--ds-color-surface-active)] data-[highlighted]:text-[var(--ds-color-text-primary)] data-[selected]:text-[var(--ds-color-text-primary)]"
                                    key={option.value}
                                    value={option.value}
                                  >
                                    <BaseSelect.ItemText className="block font-[var(--ds-font-mono)] text-[11px] leading-[14px]">
                                      {option.label}
                                    </BaseSelect.ItemText>
                                  </BaseSelect.Item>
                                ))}
                              </BaseSelect.List>
                            </BaseSelect.Popup>
                          </BaseSelect.Positioner>
                        </BaseSelect.Portal>
                      </BaseSelect.Root>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </GlassPanel>
        </motion.div>
      )}
    </FloatingDesktopPanel>
  )
}
