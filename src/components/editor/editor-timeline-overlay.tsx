"use client"

import {
  CaretDownIcon,
  CaretUpIcon,
  CircleIcon,
  DotFilledIcon,
  EyeClosedIcon,
  EyeOpenIcon,
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
import { CurveEditorPopover } from "@/components/editor/curve-editor"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { NumberInput } from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import type { KeyframeEasing } from "@/lib/easing-curve"
import { LINEAR_EASING } from "@/lib/easing-curve"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { getLongestVideoLayerDuration } from "@/lib/editor/timeline-duration"
import { useEditorStore, useLayerStore, useTimelineStore } from "@/store"
import { useAssetStore } from "@/store/asset-store"
import { isParamVisible } from "./properties-sidebar-utils"
import {
  createLayerPropertyBinding,
  createParamBinding,
  type TimelineClipboardKeyframe,
} from "@/store/timeline-store"
import type {
  AnimatedPropertyBinding,
  EditorLayer,
  ParameterDefinition,
  TimelineKeyframe,
  TimelineTrack,
} from "@/types/editor"

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
      type: "marquee"
      currentClientX: number
      currentClientY: number
      initialPrimaryKeyframeId: string | null
      initialSelectedKeyframeIds: string[]
      initialTrackId: string | null
      mode: "add" | "replace" | "toggle"
      originClientX: number
      originClientY: number
    }
  | {
      type: "playhead"
    }

type TimelineKeyframeClipboard = {
  items: TimelineClipboardKeyframe[]
  primarySourceKeyframeId: string | null
}

type ClientSelectionRect = {
  bottom: number
  left: number
  right: number
  top: number
}

const GENERAL_TIMELINE_PROPERTIES = [
  { color: "#8DB1FF", property: "opacity" },
  { color: "#A4E0A0", property: "hue" },
  { color: "#F7B365", property: "saturation" },
] as const

const GROUP_TIMELINE_PROPERTIES = [
  { color: "#8DB1FF", property: "opacity" },
  { color: "#E7D9A2", property: "visible" },
] as const

const COLLAPSED_SHELL_HEIGHT = 46
const COLLAPSED_SHELL_WIDTH = 580
const EXPANDED_SHELL_HEIGHT = 380
const EXPANDED_SHELL_WIDTH = 820
const SMALL_NUDGE_TIME = 1 / 60
const LARGE_NUDGE_TIME = 10 / 60

let timelineKeyframeClipboard: TimelineKeyframeClipboard | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createClientSelectionRect(
  originClientX: number,
  originClientY: number,
  currentClientX: number,
  currentClientY: number
): ClientSelectionRect {
  return {
    bottom: Math.max(originClientY, currentClientY),
    left: Math.min(originClientX, currentClientX),
    right: Math.max(originClientX, currentClientX),
    top: Math.min(originClientY, currentClientY),
  }
}

function rectsIntersect(left: ClientSelectionRect, right: DOMRect): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  )
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

  return definition.params.filter((entry) =>
    isParamVisible(entry, layer.params, [...definition.params], layer.type)
  )
}

function buildTimelineProperties(
  layer: EditorLayer | null,
  tracks: TimelineTrack[]
): TimelinePropertyItem[] {
  if (!layer) {
    return []
  }

  const layerProperties =
    layer.kind === "group"
      ? GROUP_TIMELINE_PROPERTIES
      : GENERAL_TIMELINE_PROPERTIES

  const properties: TimelinePropertyItem[] = layerProperties.map(
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
          <Typography as="span" tone="secondary" variant="caption">
            Auto-Key
          </Typography>
        </IconButton>
      </div>

      <span
        aria-hidden="true"
        className="block h-4 w-px shrink-0 rounded-full bg-[var(--ds-border-divider)]"
      />

      <div className="inline-flex items-center gap-2">
        <Typography as="span" tone="secondary" variant="caption">
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
          variant="caption"
        >
          sec
        </Typography>
      </div>

      <div className="inline-flex min-w-0 flex-1 items-center justify-end gap-1">
        <Typography
          as="span"
          className="min-w-[104px] whitespace-nowrap text-right text-[12px]"
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

function CurveEditorOverlayControl({
  keyframeId,
  onEasingChange,
  track,
}: {
  keyframeId: string
  onEasingChange: (
    trackId: string,
    keyframeId: string,
    easing: KeyframeEasing
  ) => void
  track: TimelineTrack
}) {
  const keyframe = track.keyframes.find((kf) => kf.id === keyframeId)
  const easing: KeyframeEasing = keyframe?.easing ?? LINEAR_EASING

  return (
    <div
      className="pointer-events-auto absolute right-3 bottom-3 z-4 inline-flex"
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
    >
      <CurveEditorPopover
        easing={easing}
        onChange={(nextEasing) =>
          onEasingChange(track.id, keyframeId, nextEasing)
        }
      />
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
  const selectedKeyframeIds = useTimelineStore(
    (state) => state.selectedKeyframeIds
  )
  const tracks = useTimelineStore((state) => state.tracks)
  const addSelectedKeyframes = useTimelineStore(
    (state) => state.addSelectedKeyframes
  )
  const nudgeSelectedKeyframes = useTimelineStore(
    (state) => state.nudgeSelectedKeyframes
  )
  const pasteKeyframes = useTimelineStore((state) => state.pasteKeyframes)
  const removeSelectedKeyframes = useTimelineStore(
    (state) => state.removeSelectedKeyframes
  )
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime)
  const setDuration = useTimelineStore((state) => state.setDuration)
  const setLoop = useTimelineStore((state) => state.setLoop)
  const setSelectedKeyframes = useTimelineStore(
    (state) => state.setSelectedKeyframes
  )
  const setPlaying = useTimelineStore((state) => state.setPlaying)
  const setSelected = useTimelineStore((state) => state.setSelected)
  const setKeyframeEasing = useTimelineStore((state) => state.setKeyframeEasing)
  const setKeyframeTime = useTimelineStore((state) => state.setKeyframeTime)
  const setTrackEnabled = useTimelineStore((state) => state.setTrackEnabled)
  const stop = useTimelineStore((state) => state.stop)
  const toggleSelectedKeyframes = useTimelineStore(
    (state) => state.toggleSelectedKeyframes
  )
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
  const trackCanvasRef = useRef<HTMLDivElement | null>(null)
  const keyframeButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [viewportSize, setViewportSize] = useState({ height: 900, width: 1440 })
  const tickPositions = useMemo(
    () => createTickPositions(effectiveDuration),
    [effectiveDuration]
  )
  const selectedKeyframeIdSet = useMemo(
    () => new Set(selectedKeyframeIds),
    [selectedKeyframeIds]
  )
  const animatedTrackEntries = useMemo(
    () =>
      animatedProperties.flatMap((entry) =>
        entry.track ? [{ entry, track: entry.track }] : []
      ),
    [animatedProperties]
  )
  const keyframeTrackIdMap = useMemo(() => {
    const nextMap = new Map<string, string>()

    for (const { track } of animatedTrackEntries) {
      for (const keyframe of track.keyframes) {
        nextMap.set(keyframe.id, track.id)
      }
    }

    return nextMap
  }, [animatedTrackEntries])
  const keyframeById = useMemo(() => {
    const nextMap = new Map<string, TimelineKeyframe>()

    for (const { track } of animatedTrackEntries) {
      for (const keyframe of track.keyframes) {
        nextMap.set(keyframe.id, keyframe)
      }
    }

    return nextMap
  }, [animatedTrackEntries])
  const orderedKeyframes = useMemo(
    () =>
      animatedTrackEntries.flatMap(({ track }) =>
        track.keyframes.map((keyframe) => ({
          keyframe,
          trackId: track.id,
        }))
      ),
    [animatedTrackEntries]
  )
  const orderedKeyframeIds = useMemo(
    () => orderedKeyframes.map(({ keyframe }) => keyframe.id),
    [orderedKeyframes]
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

  const getTrackKeyframeRangeIds = useEffectEvent(
    (track: TimelineTrack, targetKeyframeId: string) => {
      if (!selectedKeyframeId) {
        return [targetKeyframeId]
      }

      const anchorIndex = track.keyframes.findIndex(
        (keyframe) => keyframe.id === selectedKeyframeId
      )
      const targetIndex = track.keyframes.findIndex(
        (keyframe) => keyframe.id === targetKeyframeId
      )

      if (anchorIndex === -1 || targetIndex === -1) {
        return [targetKeyframeId]
      }

      const startIndex = Math.min(anchorIndex, targetIndex)
      const endIndex = Math.max(anchorIndex, targetIndex)

      return track.keyframes
        .slice(startIndex, endIndex + 1)
        .map((keyframe) => keyframe.id)
    }
  )

  const getIntersectedKeyframeIds = useEffectEvent((selectionRect: ClientSelectionRect) => {
    const intersectedKeyframeIds = new Set<string>()

    for (const keyframeId of orderedKeyframeIds) {
      const keyframeButton = keyframeButtonRefs.current.get(keyframeId)

      if (!keyframeButton) {
        continue
      }

      if (rectsIntersect(selectionRect, keyframeButton.getBoundingClientRect())) {
        intersectedKeyframeIds.add(keyframeId)
      }
    }

    return orderedKeyframeIds.filter((keyframeId) => intersectedKeyframeIds.has(keyframeId))
  })

  const applyMarqueeSelection = useEffectEvent((nextDragState: Extract<DragState, { type: "marquee" }>) => {
    const hitKeyframeIds = getIntersectedKeyframeIds(
      createClientSelectionRect(
        nextDragState.originClientX,
        nextDragState.originClientY,
        nextDragState.currentClientX,
        nextDragState.currentClientY
      )
    )
    let nextSelectedKeyframeIds: string[] = []

    if (nextDragState.mode === "replace") {
      nextSelectedKeyframeIds = hitKeyframeIds
    } else if (nextDragState.mode === "add") {
      nextSelectedKeyframeIds = [
        ...nextDragState.initialSelectedKeyframeIds,
        ...hitKeyframeIds.filter(
          (keyframeId) =>
            !nextDragState.initialSelectedKeyframeIds.includes(keyframeId)
        ),
      ]
    } else {
      const initialSelectedKeyframeIdSet = new Set(
        nextDragState.initialSelectedKeyframeIds
      )
      const hitKeyframeIdSet = new Set(hitKeyframeIds)

      nextSelectedKeyframeIds = nextDragState.initialSelectedKeyframeIds.filter(
        (keyframeId) => !hitKeyframeIdSet.has(keyframeId)
      )

      for (const keyframeId of hitKeyframeIds) {
        if (!initialSelectedKeyframeIdSet.has(keyframeId)) {
          nextSelectedKeyframeIds.push(keyframeId)
        }
      }
    }

    const nextPrimaryKeyframeId =
      nextSelectedKeyframeIds.includes(nextDragState.initialPrimaryKeyframeId ?? "")
        ? nextDragState.initialPrimaryKeyframeId
        : (hitKeyframeIds[hitKeyframeIds.length - 1] ??
          nextSelectedKeyframeIds[0] ??
          null)

    setSelectedKeyframes(
      nextPrimaryKeyframeId
        ? (keyframeTrackIdMap.get(nextPrimaryKeyframeId) ?? nextDragState.initialTrackId)
        : nextDragState.initialTrackId,
      nextSelectedKeyframeIds,
      nextPrimaryKeyframeId
    )
  })

  const getAdjacentTrackSelection = useEffectEvent((direction: -1 | 1) => {
    if (animatedTrackEntries.length === 0) {
      return null
    }

    const focusedTrackId =
      selectedTrackId ??
      animatedTrackEntries.find(({ entry }) => entry.id === focusedPropertyId)?.track.id ??
      animatedTrackEntries[0]?.track.id ??
      null

    if (!focusedTrackId) {
      return null
    }

    const currentTrackIndex = animatedTrackEntries.findIndex(
      ({ track }) => track.id === focusedTrackId
    )

    if (currentTrackIndex === -1) {
      return null
    }

    const nextTrackEntry = animatedTrackEntries[currentTrackIndex + direction]

    if (!nextTrackEntry) {
      return null
    }

    const referenceTime =
      selectedKeyframeId && keyframeTrackIdMap.get(selectedKeyframeId) === focusedTrackId
        ? (keyframeById.get(selectedKeyframeId)?.time ?? currentTime)
        : currentTime

    const nextKeyframe =
      nextTrackEntry.track.keyframes.reduce<TimelineKeyframe | null>(
        (closestKeyframe, candidate) => {
          if (!closestKeyframe) {
            return candidate
          }

          return Math.abs(candidate.time - referenceTime) <
            Math.abs(closestKeyframe.time - referenceTime)
            ? candidate
            : closestKeyframe
        },
        null
      ) ?? nextTrackEntry.track.keyframes[0] ?? null

    if (!nextKeyframe) {
      return null
    }

    return {
      keyframe: nextKeyframe,
      propertyId: nextTrackEntry.entry.id,
      track: nextTrackEntry.track,
    }
  })

  const getHorizontalNavigationKeyframe = useEffectEvent((direction: -1 | 1) => {
    const track =
      animatedTrackEntries.find(({ track: entryTrack }) => entryTrack.id === selectedTrackId)
        ?.track ?? null

    if (!track) {
      return null
    }

    if (track.keyframes.length === 0) {
      return null
    }

    const selectedKeyframeIndex = selectedKeyframeId
      ? track.keyframes.findIndex((keyframe) => keyframe.id === selectedKeyframeId)
      : -1

    if (selectedKeyframeIndex !== -1) {
      return track.keyframes[selectedKeyframeIndex + direction] ?? null
    }

    if (direction < 0) {
      for (let index = track.keyframes.length - 1; index >= 0; index -= 1) {
        const keyframe = track.keyframes[index]

        if (keyframe && keyframe.time < currentTime) {
          return keyframe
        }
      }

      return null
    }

    return (
      track.keyframes.find((keyframe) => keyframe.time > currentTime) ?? null
    )
  })

  useEffect(() => {
    if (!timelinePanelOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedKeyframeIds.length > 0
      ) {
        event.preventDefault()
        removeSelectedKeyframes()
        return
      }

      if (event.key === "Enter" && selectedKeyframeId) {
        const keyframe = keyframeById.get(selectedKeyframeId)

        if (!keyframe) {
          return
        }

        event.preventDefault()
        setCurrentTime(keyframe.time)
        return
      }

      if (
        (event.key === "c" || event.key === "C") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        if (selectedKeyframeIds.length === 0) {
          return
        }

        const selectedKeyframeIdSet = new Set(selectedKeyframeIds)
        const selectedKeyframes = orderedKeyframes.filter(({ keyframe }) =>
          selectedKeyframeIdSet.has(keyframe.id)
        )

        if (selectedKeyframes.length === 0) {
          return
        }

        event.preventDefault()
        const earliestTime = selectedKeyframes.reduce(
          (minimumTime, { keyframe }) => Math.min(minimumTime, keyframe.time),
          Number.POSITIVE_INFINITY
        )

        timelineKeyframeClipboard = {
          items: selectedKeyframes.map(({ keyframe, trackId }) => ({
            easing: structuredClone(keyframe.easing),
            relativeTime: keyframe.time - earliestTime,
            sourceKeyframeId: keyframe.id,
            sourceTrackId: trackId,
            value: structuredClone(keyframe.value),
          })),
          primarySourceKeyframeId: selectedKeyframeId,
        }
        return
      }

      if (
        (event.key === "v" || event.key === "V") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        if (!timelineKeyframeClipboard) {
          return
        }

        event.preventDefault()
        pasteKeyframes({
          items: timelineKeyframeClipboard.items,
          primarySourceKeyframeId:
            timelineKeyframeClipboard.primarySourceKeyframeId,
          targetTime: currentTime,
        })
        return
      }

      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (selectedKeyframeIds.length === 0) {
          return
        }

        event.preventDefault()
        nudgeSelectedKeyframes(
          (event.key === "ArrowRight" ? 1 : -1) *
            (event.shiftKey ? LARGE_NUDGE_TIME : SMALL_NUDGE_TIME)
        )
        return
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const nextKeyframe = getHorizontalNavigationKeyframe(
          event.key === "ArrowRight" ? 1 : -1
        )

        if (!(nextKeyframe && selectedTrackId)) {
          return
        }

        event.preventDefault()
        setSelected(selectedTrackId, nextKeyframe.id)
        setCurrentTime(nextKeyframe.time)
        return
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const nextTrackSelection = getAdjacentTrackSelection(
          event.key === "ArrowDown" ? 1 : -1
        )

        if (!nextTrackSelection) {
          return
        }

        event.preventDefault()
        setFocusedPropertyId(nextTrackSelection.propertyId)
        setSelected(nextTrackSelection.track.id, nextTrackSelection.keyframe.id)
        return
      }

      if (event.key === "Escape") {
        if (dragState?.type === "marquee") {
          setDragState(null)
          return
        }

        closeTimelinePanel()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    closeTimelinePanel,
    currentTime,
    dragState,
    keyframeById,
    nudgeSelectedKeyframes,
    orderedKeyframes,
    pasteKeyframes,
    removeSelectedKeyframes,
    selectedKeyframeId,
    selectedKeyframeIds,
    selectedTrackId,
    setCurrentTime,
    setSelected,
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

    if (dragState.type === "playhead") {
      setCurrentTime(getTimeFromClientX(event.clientX))
      return
    }

    if (dragState.type === "marquee") {
      const nextDragState: Extract<DragState, { type: "marquee" }> = {
        ...dragState,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
      }

      setDragState(nextDragState)
      applyMarqueeSelection(nextDragState)
      return
    }

    const nextTime = getTimeFromClientX(event.clientX)
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
  const marqueeStyle =
    dragState?.type === "marquee" && trackCanvasRef.current
      ? (() => {
          const rect = trackCanvasRef.current?.getBoundingClientRect()

          if (!rect) {
            return null
          }

          const scrollLeft = trackCanvasRef.current?.scrollLeft ?? 0
          const scrollTop = trackCanvasRef.current?.scrollTop ?? 0
          const selectionRect = createClientSelectionRect(
            dragState.originClientX,
            dragState.originClientY,
            dragState.currentClientX,
            dragState.currentClientY
          )

          return {
            height: selectionRect.bottom - selectionRect.top,
            left: selectionRect.left - rect.left + scrollLeft,
            top: selectionRect.top - rect.top + scrollTop,
            width: selectionRect.right - selectionRect.left,
          }
        })()
      : null

  const handleScrubStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setCurrentTime(getTimeFromClientX(event.clientX))
    setDragState({ type: "playhead" })
  }

  const handleTimelineBodyPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    let marqueeMode: Extract<DragState, { type: "marquee" }>["mode"] = "replace"

    if (event.metaKey || event.ctrlKey) {
      marqueeMode = "toggle"
    } else if (event.shiftKey) {
      marqueeMode = "add"
    }

    const nextDragState: Extract<DragState, { type: "marquee" }> = {
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      initialPrimaryKeyframeId: selectedKeyframeId,
      initialSelectedKeyframeIds: selectedKeyframeIds,
      initialTrackId: selectedTrackId,
      mode: marqueeMode,
      originClientX: event.clientX,
      originClientY: event.clientY,
      type: "marquee",
    }

    setDragState(nextDragState)
    applyMarqueeSelection(nextDragState)
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
                          const track = entry.track
                          const isFocused = focusedPropertyId === entry.id
                          const hasTrack = Boolean(track)
                          const trackEnabled = track?.enabled ?? true

                          return (
                            <div
                              className={cn(
                                "flex min-h-8 items-center gap-1.5 rounded-[10px] border border-transparent px-1.5 transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
                                isFocused && "border-white/8 bg-white/8"
                              )}
                              key={entry.id}
                            >
                              <button
                                className={cn(
                                  "flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-[10px] rounded-[10px] border border-transparent px-[10px] text-left transition-[background-color,border-color,color,transform,opacity] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/4 hover:border-white/5 active:scale-[0.995]",
                                  !trackEnabled && hasTrack && "opacity-60",
                                )}
                                onClick={() => {
                                  setFocusedPropertyId(entry.id)

                                  if (track) {
                                    setSelected(track.id)
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
                                    tone={hasTrack ? "primary" : "secondary"}
                                    variant="caption"
                                  >
                                    {entry.label}
                                  </Typography>
                                </div>
                              </button>

                              {track ? (
                                <IconButton
                                  aria-label={
                                    track.enabled
                                      ? `Disable ${entry.label} animation`
                                      : `Enable ${entry.label} animation`
                                  }
                                  className="h-7 w-7 shrink-0"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setTrackEnabled(track.id, !track.enabled)
                                  }}
                                  tooltip={track.enabled ? "Disable track" : "Enable track"}
                                  variant="ghost"
                                >
                                  {track.enabled ? (
                                    <EyeOpenIcon height={14} width={14} />
                                  ) : (
                                    <EyeClosedIcon height={14} width={14} />
                                  )}
                                </IconButton>
                              ) : null}
                            </div>
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
                  <div className="relative basis-[30px] border-b border-[var(--ds-border-divider)]">
                    <div
                      className="absolute inset-0"
                      onPointerDown={handleScrubStart}
                      ref={scrubSurfaceRef}
                    />
                    {tickPositions.minorTicks.map((tick) => (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 h-[10px] w-px bg-white/6"
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

                  <div
                    className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
                    onPointerDown={handleTimelineBodyPointerDown}
                    ref={trackCanvasRef}
                  >
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
                              "relative basis-[46px] border-b border-white/4 bg-[linear-gradient(90deg,rgb(255_255_255_/_0.02)_0%,rgb(255_255_255_/_0.015)_100%)] transition-opacity duration-160 ease-[var(--ease-out-cubic)]",
                              isFocused &&
                                "bg-[linear-gradient(90deg,rgb(var(--timeline-track-rgb,122_162_255)_/_0.12)_0%,rgb(var(--timeline-track-rgb,122_162_255)_/_0.03)_42%,rgb(255_255_255_/_0.02)_100%)]",
                              !track.enabled && "opacity-55"
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
                            {track.keyframes.map((keyframe) => {
                              const isSelected = selectedKeyframeIdSet.has(
                                keyframe.id
                              )
                              const isPrimary = selectedKeyframeId === keyframe.id

                              return (
                                <button
                                  aria-label={`Keyframe at ${formatSeconds(keyframe.time)}`}
                                  className={cn(
                                    "group absolute top-[11px] inline-flex h-[22px] w-[22px] -translate-x-1/2 cursor-grab items-center justify-center bg-transparent p-0 text-inherit active:cursor-grabbing",
                                    isSelected && "z-[2]",
                                    isPrimary && "z-[3]"
                                  )}
                                  data-selected={isSelected}
                                  key={keyframe.id}
                                  onDoubleClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setFocusedPropertyId(entry.id)
                                    setSelected(track.id, keyframe.id)
                                    setCurrentTime(keyframe.time)
                                  }}
                                  onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setFocusedPropertyId(entry.id)

                                    if (event.metaKey || event.ctrlKey) {
                                      toggleSelectedKeyframes(
                                        track.id,
                                        [keyframe.id],
                                        keyframe.id
                                      )
                                      return
                                    }

                                    if (event.shiftKey) {
                                      const rangeKeyframeIds =
                                        selectedKeyframeId &&
                                        keyframeTrackIdMap.get(selectedKeyframeId) === track.id
                                          ? getTrackKeyframeRangeIds(track, keyframe.id)
                                          : [keyframe.id]

                                      if (
                                        selectedKeyframeId &&
                                        keyframeTrackIdMap.get(selectedKeyframeId) === track.id
                                      ) {
                                        setSelectedKeyframes(
                                          track.id,
                                          rangeKeyframeIds,
                                          keyframe.id
                                        )
                                      } else {
                                        addSelectedKeyframes(
                                          track.id,
                                          [keyframe.id],
                                          keyframe.id
                                        )
                                      }
                                      return
                                    }

                                    setSelected(track.id, keyframe.id)
                                    setDragState({
                                      keyframeId: keyframe.id,
                                      trackId: track.id,
                                      type: "keyframe",
                                    })
                                  }}
                                  ref={(node) => {
                                    if (node) {
                                      keyframeButtonRefs.current.set(keyframe.id, node)
                                      return
                                    }

                                    keyframeButtonRefs.current.delete(keyframe.id)
                                  }}
                                  style={{
                                    left: `${(keyframe.time / effectiveDuration) * 100}%`,
                                  }}
                                  type="button"
                                >
                                  {isSelected ? (
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        "absolute rotate-45 border transition-[transform,opacity,box-shadow,background-color,border-radius,height,width] duration-160 ease-[var(--ease-out-cubic)]",
                                        isPrimary
                                          ? "h-[18px] w-[18px] rounded-[7px] border-white/55 bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.24)] shadow-[0_0_0_1px_rgb(255_255_255_/_0.12),0_0_20px_rgb(var(--timeline-track-rgb,122_162_255)_/_0.48)]"
                                          : "h-[15px] w-[15px] rounded-[4px] border-white/34 bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.13)] shadow-[0_0_0_1px_rgb(255_255_255_/_0.1),0_0_12px_rgb(var(--timeline-track-rgb,122_162_255)_/_0.24)]",
                                        !(track.enabled || isPrimary) && "opacity-75"
                                      )}
                                    />
                                  ) : null}
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "relative z-10 h-[11px] w-[11px] rounded-[4px] border border-white/40 bg-[rgb(var(--timeline-track-rgb,122_162_255)_/_0.95)] shadow-[0_4px_10px_rgb(0_0_0_/_0.22)] rotate-45 transition-[box-shadow,transform,background-color,border-color,opacity,height,width] duration-160 ease-[var(--ease-out-cubic)] group-hover:shadow-[0_0_0_1px_rgb(255_255_255_/_0.24),0_6px_14px_rgb(0_0_0_/_0.28)]",
                                      isSelected &&
                                        "h-[13px] w-[13px] border-white shadow-[0_0_0_1px_rgb(255_255_255_/_0.22),0_8px_18px_rgb(0_0_0_/_0.34)]",
                                      isPrimary &&
                                        "h-[12px] w-[12px] border-white bg-white shadow-[0_0_0_2px_rgb(var(--timeline-track-rgb,122_162_255)_/_0.96),0_0_0_4px_rgb(255_255_255_/_0.16),0_0_18px_rgb(var(--timeline-track-rgb,122_162_255)_/_0.46),0_10px_22px_rgb(0_0_0_/_0.38)]",
                                      !track.enabled && "opacity-60"
                                    )}
                                  />
                                </button>
                              )
                            })}
                          </div>
                        )
                      })
                    ) : (
                      <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 flex items-start justify-center">
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

                    {marqueeStyle ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute z-2 rounded-[8px] border border-[#57A4FF] bg-[#57A4FF]/18 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.06)]"
                        style={marqueeStyle}
                      />
                    ) : null}

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
	                    {selectedTrack && selectedKeyframeId ? (
	                    <CurveEditorOverlayControl
	                      keyframeId={selectedKeyframeId}
	                      onEasingChange={setKeyframeEasing}
	                      track={selectedTrack}
                    />
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
