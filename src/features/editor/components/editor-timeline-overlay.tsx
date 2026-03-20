"use client"

import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { getLayerDefinition } from "@/features/editor/config/layer-registry"
import type {
  AnimatedPropertyBinding,
  EditorLayer,
  ParameterDefinition,
  TimelineInterpolation,
  TimelineTrack,
} from "@/features/editor/types"
import { TIMELINE_INTERPOLATIONS } from "@/features/editor/types"
import { cn } from "@/shared/lib/cn"
import { GlassPanel } from "@/shared/ui/glass-panel"
import { IconButton } from "@/shared/ui/icon-button"
import { Select } from "@/shared/ui/select"
import { Typography } from "@/shared/ui/typography"
import { useEditorStore, useLayerStore, useTimelineStore } from "@/store"
import { createLayerPropertyBinding, createParamBinding } from "@/store/timelineStore"
import s from "./editor-timeline-overlay.module.css"

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

const NO_EASING_VALUE = "__none__"
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
      definition.params.find((param) => param.key === entry.visibleWhen?.key)?.defaultValue

    if ("equals" in entry.visibleWhen) {
      return controllingValue === entry.visibleWhen.equals
    }

    return typeof controllingValue === "number" && controllingValue >= entry.visibleWhen.gte
  })
}

function buildTimelineProperties(
  layer: EditorLayer | null,
  tracks: TimelineTrack[],
): TimelinePropertyItem[] {
  if (!layer) {
    return []
  }

  const properties: TimelinePropertyItem[] = GENERAL_TIMELINE_PROPERTIES.map((entry) => {
    const binding = createLayerPropertyBinding(entry.property)
    const id = getPropertyId(binding)

    return {
      binding,
      color: entry.color,
      id,
      kind: "layer",
      label: binding.label,
      track: tracks.find((track) => track.layerId === layer.id && getPropertyId(track.binding) === id) ?? null,
    }
  })

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
      track: tracks.find((track) => track.layerId === layer.id && getPropertyId(track.binding) === id) ?? null,
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

  for (let current = 0; current <= safeDuration + Number.EPSILON; current += majorStep) {
    majorTicks.push(Number(current.toFixed(3)))
  }

  if (majorTicks[majorTicks.length - 1] !== safeDuration) {
    majorTicks.push(safeDuration)
  }

  for (let current = 0; current <= safeDuration + Number.EPSILON; current += minorStep) {
    const normalized = Number(current.toFixed(3))
    if (!majorTicks.some((tick) => Math.abs(tick - normalized) < 0.001)) {
      minorTicks.push(normalized)
    }
  }

  return { majorTicks, minorTicks }
}

function TimelineTransport({
  currentTime,
  duration,
  expanded,
  isPlaying,
  loop,
  onDurationChange,
  onStop,
  onToggleExpanded,
  onToggleLoop,
  onTogglePlaying,
}: {
  currentTime: number
  duration: number
  expanded: boolean
  isPlaying: boolean
  loop: boolean
  onDurationChange: (value: number) => void
  onStop: () => void
  onToggleExpanded: () => void
  onToggleLoop: () => void
  onTogglePlaying: () => void
}) {
  return (
    <div
      className={cn(
        s.transport,
        expanded ? s.transportExpanded : s.transportCompact,
      )}
    >
      <div className={s.controlGroup}>
        <IconButton
          aria-label={isPlaying ? "Pause playback" : "Play timeline"}
          className={s.transportButton}
          onClick={onTogglePlaying}
          variant="default"
        >
          {isPlaying ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
        </IconButton>
        <IconButton
          aria-label="Stop playback"
          className={s.transportButton}
          onClick={onStop}
          variant="default"
        >
          <StopIcon size={14} weight="fill" />
        </IconButton>
      </div>

      <span aria-hidden="true" className={s.divider} />

      <div className={s.controlGroup}>
        <IconButton
          aria-label={loop ? "Disable loop" : "Enable loop"}
          className={cn(s.transportButton, s.loopButton, loop && s.transportButtonActive)}
          onClick={onToggleLoop}
          variant={loop ? "active" : "default"}
        >
          <ArrowClockwiseIcon size={14} weight="bold" />
          <Typography as="span" tone="secondary" variant="monoSm">
            Loop
          </Typography>
        </IconButton>
      </div>

      <span aria-hidden="true" className={s.divider} />

      <div className={s.durationGroup}>
        <Typography as="span" tone="secondary" variant="monoSm">
          Duration
        </Typography>
        <input
          aria-label="Timeline duration in seconds"
          className={s.durationInput}
          max={120}
          min={0.25}
          onChange={(event) => {
            const nextValue = event.currentTarget.valueAsNumber

            if (Number.isFinite(nextValue)) {
              onDurationChange(nextValue)
            }
          }}
          step={0.25}
          type="number"
          value={duration.toFixed(2)}
        />
        <Typography as="span" className={s.durationSuffix} tone="secondary" variant="monoSm">
          sec
        </Typography>
      </div>

      <div className={s.statusGroup}>
        <Typography as="span" className={s.timeReadout} tone="secondary" variant="monoMd">
          {formatSeconds(currentTime)} / {formatSeconds(duration)}
        </Typography>
        <IconButton
          aria-label={expanded ? "Collapse timeline panel" : "Expand timeline panel"}
          className={s.transportButton}
          onClick={onToggleExpanded}
          variant="default"
        >
          {expanded ? <CaretDownIcon size={14} weight="bold" /> : <CaretUpIcon size={14} weight="bold" />}
        </IconButton>
      </div>
    </div>
  )
}

export function EditorTimelineOverlay() {
  const reduceMotion = useReducedMotion() ?? false
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const closeTimelinePanel = useEditorStore((state) => state.closeTimelinePanel)
  const toggleTimelinePanel = useEditorStore((state) => state.toggleTimelinePanel)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const selectedLayer = useLayerStore((state) =>
    selectedLayerId
      ? (state.layers.find((layer) => layer.id === selectedLayerId) ?? null)
      : null,
  )

  const currentTime = useTimelineStore((state) => state.currentTime)
  const duration = useTimelineStore((state) => state.duration)
  const isPlaying = useTimelineStore((state) => state.isPlaying)
  const loop = useTimelineStore((state) => state.loop)
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId)
  const selectedKeyframeId = useTimelineStore((state) => state.selectedKeyframeId)
  const tracks = useTimelineStore((state) => state.tracks)
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime)
  const setDuration = useTimelineStore((state) => state.setDuration)
  const setLoop = useTimelineStore((state) => state.setLoop)
  const setSelected = useTimelineStore((state) => state.setSelected)
  const setTrackInterpolation = useTimelineStore((state) => state.setTrackInterpolation)
  const setKeyframeTime = useTimelineStore((state) => state.setKeyframeTime)
  const stop = useTimelineStore((state) => state.stop)
  const togglePlaying = useTimelineStore((state) => state.togglePlaying)

  const layerTracks = useMemo(
    () => (selectedLayer ? tracks.filter((track) => track.layerId === selectedLayer.id) : []),
    [selectedLayer, tracks],
  )
  const properties = useMemo(
    () => buildTimelineProperties(selectedLayer, tracks),
    [selectedLayer, tracks],
  )
  const animatedProperties = useMemo(
    () => properties.filter((entry) => entry.track),
    [properties],
  )
  const [focusedPropertyId, setFocusedPropertyId] = useState<string | null>(null)
  const scrubSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const previousPanelOpenRef = useRef(timelinePanelOpen)
  const [isPanelExiting, setIsPanelExiting] = useState(false)
  const tickPositions = useMemo(() => createTickPositions(duration), [duration])

  useEffect(() => {
    if (!(timelinePanelOpen && selectedLayer)) {
      return
    }

    const selectedTrack = layerTracks.find((track) => track.id === selectedTrackId) ?? null

    if (selectedTrack) {
      const nextPropertyId = getPropertyId(selectedTrack.binding)
      if (focusedPropertyId !== nextPropertyId) {
        setFocusedPropertyId(nextPropertyId)
      }
      return
    }

    if (focusedPropertyId && properties.some((entry) => entry.id === focusedPropertyId)) {
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
    if (timelinePanelOpen) {
      setIsPanelExiting(false)
      previousPanelOpenRef.current = true
      return
    }

    if (previousPanelOpenRef.current) {
      setIsPanelExiting(true)
    }

    previousPanelOpenRef.current = false
  }, [timelinePanelOpen])

  useEffect(() => {
    if (immersiveCanvas) {
      setIsPanelExiting(false)
      previousPanelOpenRef.current = false
    }
  }, [immersiveCanvas])

  useEffect(() => {
    if (!timelinePanelOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTimelinePanel()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [closeTimelinePanel, timelinePanelOpen])

  const getTimeFromClientX = useEffectEvent((clientX: number) => {
    const surface = scrubSurfaceRef.current

    if (!surface) {
      return currentTime
    }

    const rect = surface.getBoundingClientRect()
    const progress = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0
    return progress * duration
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

  if (immersiveCanvas) {
    return null
  }

  const selectedTrack = layerTracks.find((track) => track.id === selectedTrackId) ?? null
  const easingValue = selectedTrack?.interpolation ?? NO_EASING_VALUE
  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0

  const handleScrubStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setCurrentTime(getTimeFromClientX(event.clientX))
    setDragState({ type: "playhead" })
  }

  return (
    <div className={s.root}>
      <div className={s.stack}>
        <AnimatePresence
          initial={false}
          onExitComplete={() => {
            setIsPanelExiting(false)
          }}
        >
          {timelinePanelOpen ? (
            <motion.div
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              className={s.panelWrap}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={
                reduceMotion
                  ? { duration: 0.14, ease: "easeOut" }
                  : { damping: 34, mass: 0.9, stiffness: 320, type: "spring" }
              }
            >
              <GlassPanel className={s.panel} variant="panel">
                <div className={s.panelHeader}>
                  <TimelineTransport
                    currentTime={currentTime}
                    duration={duration}
                    expanded={true}
                    isPlaying={isPlaying}
                    loop={loop}
                    onDurationChange={setDuration}
                    onStop={stop}
                    onToggleExpanded={toggleTimelinePanel}
                    onToggleLoop={() => setLoop(!loop)}
                    onTogglePlaying={togglePlaying}
                  />
                </div>

                <div className={s.panelBody}>
                  <div className={s.panelSidebar}>
                    <div className={s.panelSection}>
                      <Typography className={s.sectionTitle} tone="secondary" variant="overline">
                        Properties
                      </Typography>

                      <div className={s.propertyList}>
                        {properties.length > 0 ? (
                          properties.map((entry) => {
                            const isFocused = focusedPropertyId === entry.id
                            const hasTrack = Boolean(entry.track)

                            return (
                              <button
                                className={cn(
                                  s.propertyRow,
                                  isFocused && s.propertyRowActive,
                                  hasTrack ? s.propertyRowAnimated : s.propertyRowInactive,
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
                                <div className={s.propertyMeta}>
                                  <span
                                    aria-hidden="true"
                                    className={s.propertySwatch}
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <Typography
                                    as="span"
                                    className={s.propertyLabel}
                                    tone={hasTrack ? "primary" : "muted"}
                                    variant="monoSm"
                                  >
                                    {entry.label}
                                  </Typography>
                                </div>
                                <span
                                  aria-hidden="true"
                                  className={hasTrack ? s.propertyIndicator : s.propertyIndicatorMuted}
                                  style={
                                    hasTrack
                                      ? ({
                                          "--timeline-track-rgb": hexToRgbChannels(entry.color),
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

                    <div className={s.panelSection}>
                      <Typography className={s.sectionTitle} tone="secondary" variant="overline">
                        Easing
                      </Typography>

                      <Select
                        className={s.easingSelect ?? ""}
                        disabled={!selectedTrack}
                        onValueChange={(value) => {
                          if (value && value !== NO_EASING_VALUE && selectedTrack) {
                            setTrackInterpolation(
                              selectedTrack.id,
                              value as TimelineInterpolation,
                            )
                          }
                        }}
                        options={[
                          {
                            disabled: true,
                            label: "Select easing",
                            value: NO_EASING_VALUE,
                          },
                          ...INTERPOLATION_OPTIONS,
                        ]}
                        placeholder="Select easing"
                        value={easingValue}
                      />
                    </div>
                  </div>

                  <div className={s.timelinePane}>
                    <div
                      className={s.scrubSurface}
                      onPointerDown={handleScrubStart}
                      ref={scrubSurfaceRef}
                    >
                      <div className={s.ruler}>
                        {tickPositions.minorTicks.map((tick) => (
                          <span
                            aria-hidden="true"
                            className={s.tickMinor}
                            key={`minor-${tick}`}
                            style={{ left: `${(tick / duration) * 100}%` }}
                          />
                        ))}

                        {tickPositions.majorTicks.map((tick) => (
                          <span
                            aria-hidden="true"
                            className={s.tickMajor}
                            key={`major-${tick}`}
                            style={{ left: `${(tick / duration) * 100}%` }}
                          />
                        ))}

                        {tickPositions.majorTicks.map((tick) => (
                          <Typography
                            as="span"
                            className={s.tickLabel}
                            key={`label-${tick}`}
                            tone="muted"
                            variant="monoXs"
                            style={{ left: `${(tick / duration) * 100}%` }}
                          >
                            {tick.toFixed(1)}
                          </Typography>
                        ))}
                      </div>

                      <div className={s.lanes}>
                        {animatedProperties.length > 0 ? (
                          animatedProperties.map((entry) => {
                            const track = entry.track

                            if (!track) {
                              return null
                            }

                            const isFocused = focusedPropertyId === entry.id

                            return (
                              <div
                                className={cn(s.lane, isFocused && s.laneActive)}
                                key={track.id}
                                style={
                                  {
                                    "--timeline-track-rgb": hexToRgbChannels(entry.color),
                                  } as CSSProperties
                                }
                              >
                                <div
                                  className={cn(s.laneRail, !track.enabled && s.laneRailDisabled)}
                                />
                                {track.keyframes.map((keyframe) => (
                                  <button
                                    aria-label={`Keyframe at ${formatSeconds(keyframe.time)}`}
                                    className={cn(
                                      s.laneKeyframe,
                                      selectedKeyframeId === keyframe.id && s.laneKeyframeSelected,
                                    )}
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
                                    style={{ left: `${(keyframe.time / duration) * 100}%` }}
                                    type="button"
                                  >
                                    <span aria-hidden="true" className={s.laneKeyframeShape} />
                                  </button>
                                ))}
                              </div>
                            )
                          })
                        ) : (
                          <div className={s.emptySurface}>
                            <div className={s.emptyCard}>
                              <Typography align="center" variant="body">
                                {selectedLayer
                                  ? "Add the first keyframe from the Properties panel."
                                  : "Select a layer to start editing animation."}
                              </Typography>
                              <Typography align="center" tone="muted" variant="caption">
                                {selectedLayer
                                  ? "The diamond buttons appear next to animatable properties while the timeline is open."
                                  : "The collapsed bar still works for transport even without a selected layer."}
                              </Typography>
                            </div>
                          </div>
                        )}

                        <div className={s.playhead} style={{ left: `${progress * 100}%` }}>
                          <div
                            aria-hidden="true"
                            className={s.playheadHandle}
                            onPointerDown={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setDragState({ type: "playhead" })
                            }}
                          />
                          <div aria-hidden="true" className={s.playheadLine} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!(timelinePanelOpen || isPanelExiting) ? (
          <div className={s.barWrap}>
            <GlassPanel className={cn(s.bar, s.barCollapsed)} variant="panel">
              <TimelineTransport
                currentTime={currentTime}
                duration={duration}
                expanded={false}
                isPlaying={isPlaying}
                loop={loop}
                onDurationChange={setDuration}
                onStop={stop}
                onToggleExpanded={toggleTimelinePanel}
                onToggleLoop={() => setLoop(!loop)}
                onTogglePlaying={togglePlaying}
              />
            </GlassPanel>
          </div>
        ) : null}
      </div>
    </div>
  )
}
