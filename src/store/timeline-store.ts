import { create } from "zustand"
import { advanceProjectTimeline } from "@/renderer/project-clock"
import { getDefaultProjectTimeline } from "@/lib/editor/default-project"
import {
  type KeyframeEasing,
  cloneEasing,
  defaultEasingForValueType,
  migrateInterpolationToEasing,
} from "@/lib/easing-curve"
import type {
  AnimatedPropertyBinding,
  AnimatableValueType,
  EditorLayer,
  LayerAnimatableProperty,
  ParameterType,
  ParameterValue,
  TimelineKeyframe,
  TimelineStateSnapshot,
  TimelineTrack,
} from "@/types/editor"
import {
  cloneParameterValue,
  getParameterDefinition,
} from "@/lib/editor/parameter-schema"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"

export interface TimelineStoreState extends TimelineStateSnapshot {
  frozen: boolean
  lastRenderedClockTime: number
}

interface ToggleKeyframeInput {
  binding: AnimatedPropertyBinding
  layerId: string
  time?: number
  value: ParameterValue
}

interface UpsertKeyframeInput extends ToggleKeyframeInput {}

export interface TimelineClipboardKeyframe {
  easing: KeyframeEasing
  relativeTime: number
  sourceKeyframeId: string
  sourceTrackId: string
  value: ParameterValue
}

interface PasteKeyframesInput {
  items: TimelineClipboardKeyframe[]
  primarySourceKeyframeId?: string | null
  targetTime?: number
}

export interface TimelineStoreActions {
  addSelectedKeyframes: (
    trackId: string | null,
    keyframeIds: string[],
    primaryKeyframeId?: string | null,
  ) => void
  advance: (delta: number) => void
  clearLayerTracks: (layerId: string) => void
  getTrackForBinding: (
    layerId: string,
    binding: AnimatedPropertyBinding,
  ) => TimelineTrack | null
  nudgeSelectedKeyframes: (delta: number) => void
  pasteKeyframes: (input: PasteKeyframesInput) => void
  pruneTracks: (layers: EditorLayer[]) => void
  replaceState: (
    nextState: Pick<
      TimelineStateSnapshot,
      | "currentTime"
      | "duration"
      | "isPlaying"
      | "loop"
      | "selectedKeyframeId"
      | "selectedKeyframeIds"
      | "selectedTrackId"
      | "tracks"
    >,
  ) => void
  removeKeyframe: (trackId: string, keyframeId: string) => void
  removeSelectedKeyframes: () => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setLoop: (loop: boolean) => void
  setFrozen: (frozen: boolean) => void
  setKeyframeEasing: (trackId: string, keyframeId: string, easing: KeyframeEasing) => void
  setLastRenderedClockTime: (time: number) => void
  setPlaying: (playing: boolean) => void
  setSelected: (trackId: string | null, keyframeId?: string | null) => void
  setSelectedKeyframes: (
    trackId: string | null,
    keyframeIds: string[],
    primaryKeyframeId?: string | null,
  ) => void
  setTrackEnabled: (trackId: string, enabled: boolean) => void
  setKeyframeTime: (trackId: string, keyframeId: string, time: number) => void
  stop: () => void
  toggleKeyframe: (input: ToggleKeyframeInput) => void
  toggleSelectedKeyframes: (
    trackId: string | null,
    keyframeIds: string[],
    primaryKeyframeId?: string | null,
  ) => void
  togglePlaying: () => void
  upsertKeyframe: (input: UpsertKeyframeInput) => void
}

export type TimelineStore = TimelineStoreState & TimelineStoreActions

const DEFAULT_DURATION = 6
const MIN_DURATION = 0.25
const MAX_DURATION = 120
const TIME_EPSILON = 1 / 240
const DEFAULT_PROJECT_TIMELINE = getDefaultProjectTimeline()

function clampDuration(duration: number): number {
  if (!Number.isFinite(duration)) {
    return DEFAULT_DURATION
  }

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration))
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) {
    return 0
  }

  return Math.min(Math.max(duration, MIN_DURATION), Math.max(0, time))
}

function sortKeyframes(keyframes: TimelineKeyframe[]): TimelineKeyframe[] {
  return [...keyframes].sort((left, right) => left.time - right.time)
}

function bindingEquals(left: AnimatedPropertyBinding, right: AnimatedPropertyBinding): boolean {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === "param" && right.kind === "param") {
    return left.key === right.key
  }

  if (left.kind === "layer" && right.kind === "layer") {
    return left.property === right.property
  }

  return false
}

function isAnimatableValueType(
  valueType: ParameterType | AnimatableValueType,
): valueType is AnimatableValueType {
  return valueType !== "text"
}

function defaultEasingForBinding(binding: AnimatedPropertyBinding): KeyframeEasing {
  return defaultEasingForValueType(binding.valueType)
}

function getLayerBindingValueType(property: LayerAnimatableProperty): "boolean" | "number" {
  if (property === "visible") {
    return "boolean"
  }

  return "number"
}

export function createLayerPropertyBinding(
  property: LayerAnimatableProperty,
): AnimatedPropertyBinding {
  const labelByProperty: Record<LayerAnimatableProperty, string> = {
    hue: "Hue",
    opacity: "Opacity",
    saturation: "Saturation",
    visible: "Visible",
  }

  return {
    kind: "layer",
    label: labelByProperty[property],
    property,
    valueType: getLayerBindingValueType(property),
  }
}

export function createParamBinding(
  layer: EditorLayer,
  key: string,
): AnimatedPropertyBinding | null {
  const definition = getParameterDefinition(getLayerDefinition(layer.type).params, key)

  if (!(definition && isAnimatableValueType(definition.type))) {
    return null
  }

  return {
    key,
    kind: "param",
    label: definition.label,
    valueType: definition.type,
  }
}

function cloneTrack(track: TimelineTrack): TimelineTrack {
  const clone: TimelineTrack = {
    ...track,
    binding: { ...track.binding },
    keyframes: track.keyframes.map((kf) => ({
      ...kf,
      easing: cloneEasing(
        kf.easing
          ?? track.easing
          ?? (track.interpolation
            ? migrateInterpolationToEasing(track.interpolation)
            : defaultEasingForBinding(track.binding)),
      ),
      value: cloneParameterValue(kf.value),
    })),
  }

  if (track.easing) {
    clone.easing = cloneEasing(track.easing)
  }

  return clone
}

/**
 * Migrate a track from the old string-based interpolation to the new easing field.
 */
function migrateTrackEasing(track: TimelineTrack): TimelineTrack {
  const fallbackEasing = track.easing
    ?? (track.interpolation ? migrateInterpolationToEasing(track.interpolation) : null)
    ?? defaultEasingForBinding(track.binding)

  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({
      ...keyframe,
      easing: cloneEasing(keyframe.easing ?? fallbackEasing),
    })),
  }
}

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.map(cloneTrack)
}

type TimelineSelectionState = Pick<
  TimelineStateSnapshot,
  "selectedKeyframeId" | "selectedKeyframeIds" | "selectedTrackId"
>

function dedupeKeyframeIds(keyframeIds: string[]): string[] {
  const seen = new Set<string>()
  const nextKeyframeIds: string[] = []

  for (const keyframeId of keyframeIds) {
    if (seen.has(keyframeId)) {
      continue
    }

    seen.add(keyframeId)
    nextKeyframeIds.push(keyframeId)
  }

  return nextKeyframeIds
}

function getTrackIds(tracks: TimelineTrack[]): Set<string> {
  return new Set(tracks.map((track) => track.id))
}

function getKeyframeTrackIdMap(tracks: TimelineTrack[]): Map<string, string> {
  const keyframeTrackIdMap = new Map<string, string>()

  for (const track of tracks) {
    for (const keyframe of track.keyframes) {
      keyframeTrackIdMap.set(keyframe.id, track.id)
    }
  }

  return keyframeTrackIdMap
}

function sanitizeSelectionState(
  tracks: TimelineTrack[],
  selection: TimelineSelectionState,
): TimelineSelectionState {
  const trackIds = getTrackIds(tracks)
  const keyframeTrackIdMap = getKeyframeTrackIdMap(tracks)
  let selectedKeyframeIds = dedupeKeyframeIds(
    selection.selectedKeyframeIds.filter((keyframeId) =>
      keyframeTrackIdMap.has(keyframeId),
    ),
  )

  if (
    selection.selectedKeyframeId &&
    keyframeTrackIdMap.has(selection.selectedKeyframeId) &&
    !selectedKeyframeIds.includes(selection.selectedKeyframeId)
  ) {
    selectedKeyframeIds = [
      selection.selectedKeyframeId,
      ...selectedKeyframeIds,
    ]
  }

  let selectedKeyframeId =
    selection.selectedKeyframeId &&
    keyframeTrackIdMap.has(selection.selectedKeyframeId)
      ? selection.selectedKeyframeId
      : null

  if (!(selectedKeyframeId && selectedKeyframeIds.includes(selectedKeyframeId))) {
    selectedKeyframeId = selectedKeyframeIds[0] ?? null
  }

  let selectedTrackId =
    selection.selectedTrackId && trackIds.has(selection.selectedTrackId)
      ? selection.selectedTrackId
      : null

  if (!(selectedTrackId || !selectedKeyframeId)) {
    selectedTrackId = keyframeTrackIdMap.get(selectedKeyframeId) ?? null
  }

  return {
    selectedKeyframeId,
    selectedKeyframeIds,
    selectedTrackId,
  }
}

function createSelectionState(
  selectedTrackId: string | null,
  selectedKeyframeId: string | null,
): TimelineSelectionState {
  return {
    selectedKeyframeId,
    selectedKeyframeIds: selectedKeyframeId ? [selectedKeyframeId] : [],
    selectedTrackId,
  }
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  currentTime: 0,
  duration: DEFAULT_PROJECT_TIMELINE.duration,
  frozen: false,
  isPlaying: true,
  lastRenderedClockTime: 0,
  loop: DEFAULT_PROJECT_TIMELINE.loop,
  selectedKeyframeId: null,
  selectedKeyframeIds: [],
  selectedTrackId: null,
  tracks: DEFAULT_PROJECT_TIMELINE.tracks,

  setFrozen: (frozen) => {
    set((state) => ({
      frozen,
      isPlaying: frozen ? false : state.isPlaying,
    }))
  },

  setLastRenderedClockTime: (time) => {
    set({ lastRenderedClockTime: time })
  },

  setPlaying: (isPlaying) => {
    set({ isPlaying })
  },

  togglePlaying: () => {
    set((state) => ({
      isPlaying: !state.isPlaying,
    }))
  },

  stop: () => {
    set({
      currentTime: 0,
      isPlaying: false,
    })
  },

  setLoop: (loop) => {
    set({ loop })
  },

  setDuration: (duration) => {
    set((state) => {
      const nextDuration = clampDuration(duration)

      return {
        currentTime: clampTime(state.currentTime, nextDuration),
        duration: nextDuration,
        tracks: state.tracks.map((track) => ({
          ...track,
          keyframes: sortKeyframes(
            track.keyframes.map((keyframe) => ({
              ...keyframe,
              time: clampTime(keyframe.time, nextDuration),
            })),
          ),
        })),
      }
    })
  },

  setCurrentTime: (currentTime) => {
    set((state) => {
      const nextTime = clampTime(currentTime, state.duration)

      if (Math.abs(nextTime - state.currentTime) <= Number.EPSILON) {
        return state
      }

      return {
        currentTime: nextTime,
      }
    })
  },

  advance: (delta) => {
    if (!Number.isFinite(delta) || delta <= 0) {
      return
    }

    set((state) => {
      const next = advanceProjectTimeline(state, delta)

      if (
        Math.abs(next.currentTime - state.currentTime) <= Number.EPSILON &&
        next.isPlaying === state.isPlaying
      ) {
        return state
      }

      return {
        currentTime: next.currentTime,
        isPlaying: next.isPlaying,
      }
    })
  },

  toggleKeyframe: ({ binding, layerId, time, value }) => {
    if (!isAnimatableValueType(binding.valueType)) {
      return
    }

    set((state) => {
      const targetTime = clampTime(time ?? state.currentTime, state.duration)
      const trackIndex = state.tracks.findIndex(
        (track) => track.layerId === layerId && bindingEquals(track.binding, binding),
      )

      if (trackIndex === -1) {
        const trackId = crypto.randomUUID()
        const keyframeId = crypto.randomUUID()

        return {
          ...createSelectionState(trackId, keyframeId),
          tracks: [
            ...state.tracks,
            {
              binding: { ...binding },
              easing: defaultEasingForBinding(binding),
              enabled: true,
              id: trackId,
              keyframes: [
                {
                  easing: defaultEasingForBinding(binding),
                  id: keyframeId,
                  time: targetTime,
                  value: cloneParameterValue(value),
                },
              ],
              layerId,
            },
          ],
        }
      }

      const track = state.tracks[trackIndex]

      if (!track) {
        return state
      }

      const existingKeyframe = track.keyframes.find(
        (keyframe) => Math.abs(keyframe.time - targetTime) <= TIME_EPSILON,
      )

      if (existingKeyframe) {
        const nextTracks = [...state.tracks]
        const nextTrack = cloneTrack(track)
        nextTrack.keyframes = nextTrack.keyframes.filter(
          (keyframe) => keyframe.id !== existingKeyframe.id,
        )

        if (nextTrack.keyframes.length === 0) {
          nextTracks.splice(trackIndex, 1)
        } else {
          nextTracks[trackIndex] = nextTrack
        }

        return {
          ...sanitizeSelectionState(nextTracks, {
            selectedKeyframeId:
              state.selectedKeyframeId === existingKeyframe.id
                ? null
                : state.selectedKeyframeId,
            selectedKeyframeIds: state.selectedKeyframeIds.filter(
              (keyframeId) => keyframeId !== existingKeyframe.id,
            ),
            selectedTrackId:
              nextTrack.keyframes.length === 0 && state.selectedTrackId === track.id
                ? null
                : state.selectedTrackId,
          }),
          tracks: nextTracks,
        }
      }

      const keyframeId = crypto.randomUUID()
      const nextTrack = cloneTrack(track)
      nextTrack.enabled = true
      nextTrack.keyframes = sortKeyframes([
        ...nextTrack.keyframes,
        {
          easing: defaultEasingForBinding(binding),
          id: keyframeId,
          time: targetTime,
          value: cloneParameterValue(value),
        },
      ])

      const nextTracks = [...state.tracks]
      nextTracks[trackIndex] = nextTrack

      return {
        ...createSelectionState(nextTrack.id, keyframeId),
        tracks: nextTracks,
      }
    })
  },

  upsertKeyframe: ({ binding, layerId, time, value }) => {
    if (!isAnimatableValueType(binding.valueType)) {
      return
    }

    set((state) => {
      const targetTime = clampTime(time ?? state.currentTime, state.duration)
      const trackIndex = state.tracks.findIndex(
        (track) => track.layerId === layerId && bindingEquals(track.binding, binding),
      )

      if (trackIndex === -1) {
        const trackId = crypto.randomUUID()
        const keyframeId = crypto.randomUUID()

        return {
          ...createSelectionState(trackId, keyframeId),
          tracks: [
            ...state.tracks,
            {
              binding: { ...binding },
              easing: defaultEasingForBinding(binding),
              enabled: true,
              id: trackId,
              keyframes: [
                {
                  easing: defaultEasingForBinding(binding),
                  id: keyframeId,
                  time: targetTime,
                  value: cloneParameterValue(value),
                },
              ],
              layerId,
            },
          ],
        }
      }

      const track = state.tracks[trackIndex]

      if (!track) {
        return state
      }

      const nextTrack = cloneTrack(track)
      const existingKeyframeIndex = nextTrack.keyframes.findIndex(
        (keyframe) => Math.abs(keyframe.time - targetTime) <= TIME_EPSILON,
      )
      let selectedKeyframeId = state.selectedKeyframeId

      if (existingKeyframeIndex !== -1) {
        const currentKeyframe = nextTrack.keyframes[existingKeyframeIndex]

        if (!currentKeyframe) {
          return state
        }

        nextTrack.keyframes[existingKeyframeIndex] = {
          ...currentKeyframe,
          value: cloneParameterValue(value),
        }
        selectedKeyframeId = currentKeyframe.id
      } else {
        const lastKeyframe = nextTrack.keyframes[nextTrack.keyframes.length - 1]
        const easing = lastKeyframe?.easing
          ? cloneEasing(lastKeyframe.easing)
          : defaultEasingForBinding(track.binding)
        const keyframeId = crypto.randomUUID()
        nextTrack.keyframes = sortKeyframes([
          ...nextTrack.keyframes,
          {
            easing,
            id: keyframeId,
            time: targetTime,
            value: cloneParameterValue(value),
          },
        ])
        selectedKeyframeId = keyframeId
      }

      const nextTracks = [...state.tracks]
      nextTracks[trackIndex] = nextTrack

      return {
        ...createSelectionState(nextTrack.id, selectedKeyframeId),
        tracks: nextTracks,
      }
    })
  },

  setSelectedKeyframes: (selectedTrackId, selectedKeyframeIds, selectedKeyframeId = null) => {
    set((state) =>
      sanitizeSelectionState(state.tracks, {
        selectedKeyframeId:
          selectedKeyframeId ?? selectedKeyframeIds[0] ?? null,
        selectedKeyframeIds,
        selectedTrackId,
      }),
    )
  },

  addSelectedKeyframes: (selectedTrackId, keyframeIds, primaryKeyframeId = null) => {
    set((state) =>
      sanitizeSelectionState(state.tracks, {
        selectedKeyframeId:
          primaryKeyframeId ?? state.selectedKeyframeId ?? keyframeIds[0] ?? null,
        selectedKeyframeIds: [...state.selectedKeyframeIds, ...keyframeIds],
        selectedTrackId: selectedTrackId ?? state.selectedTrackId,
      }),
    )
  },

  toggleSelectedKeyframes: (selectedTrackId, keyframeIds, primaryKeyframeId = null) => {
    set((state) => {
      const toggledKeyframeIds = dedupeKeyframeIds(keyframeIds)
      if (toggledKeyframeIds.length === 0) {
        return state
      }

      const selectedKeyframeIdSet = new Set(state.selectedKeyframeIds)
      const nextSelectedKeyframeIds = state.selectedKeyframeIds.filter(
        (keyframeId) => !toggledKeyframeIds.includes(keyframeId),
      )

      for (const keyframeId of toggledKeyframeIds) {
        if (!selectedKeyframeIdSet.has(keyframeId)) {
          nextSelectedKeyframeIds.push(keyframeId)
        }
      }

      return sanitizeSelectionState(state.tracks, {
        selectedKeyframeId:
          primaryKeyframeId ??
          (state.selectedKeyframeId &&
          nextSelectedKeyframeIds.includes(state.selectedKeyframeId)
            ? state.selectedKeyframeId
            : null),
        selectedKeyframeIds: nextSelectedKeyframeIds,
        selectedTrackId: selectedTrackId ?? state.selectedTrackId,
      })
    })
  },

  setTrackEnabled: (trackId, enabled) => {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, enabled } : track,
      ),
    }))
  },

  setKeyframeEasing: (trackId, keyframeId, easing) => {
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) return track

        return {
          ...track,
          keyframes: track.keyframes.map((keyframe) =>
            keyframe.id === keyframeId
              ? { ...keyframe, easing: cloneEasing(easing) }
              : keyframe,
          ),
        }
      }),
    }))
  },

  setSelected: (selectedTrackId, selectedKeyframeId = null) => {
    set((state) =>
      sanitizeSelectionState(
        state.tracks,
        createSelectionState(selectedTrackId, selectedKeyframeId),
      ),
    )
  },

  setKeyframeTime: (trackId, keyframeId, time) => {
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) {
          return track
        }

        return {
          ...track,
          keyframes: sortKeyframes(
            track.keyframes.map((keyframe) =>
              keyframe.id === keyframeId
                ? {
                    ...keyframe,
                    time: clampTime(time, state.duration),
                  }
                : keyframe,
            ),
          ),
        }
      }),
    }))
  },

  removeKeyframe: (trackId, keyframeId) => {
    set((state) => {
      const nextTracks = state.tracks
        .map((track) => {
          if (track.id !== trackId) {
            return track
          }

          return {
            ...track,
            keyframes: track.keyframes.filter((keyframe) => keyframe.id !== keyframeId),
          }
        })
        .filter((track) => track.keyframes.length > 0)

      return {
        ...sanitizeSelectionState(nextTracks, {
          selectedKeyframeId:
            state.selectedKeyframeId === keyframeId ? null : state.selectedKeyframeId,
          selectedKeyframeIds: state.selectedKeyframeIds.filter(
            (selectedId) => selectedId !== keyframeId,
          ),
          selectedTrackId:
            state.selectedTrackId === trackId &&
            !nextTracks.some((track) => track.id === trackId)
              ? null
              : state.selectedTrackId,
        }),
        tracks: nextTracks,
      }
    })
  },

  removeSelectedKeyframes: () => {
    set((state) => {
      if (state.selectedKeyframeIds.length === 0) {
        return state
      }

      const selectedKeyframeIdSet = new Set(state.selectedKeyframeIds)
      const nextTracks = state.tracks
        .map((track) => ({
          ...track,
          keyframes: track.keyframes.filter(
            (keyframe) => !selectedKeyframeIdSet.has(keyframe.id),
          ),
        }))
        .filter((track) => track.keyframes.length > 0)

      return {
        ...sanitizeSelectionState(nextTracks, {
          selectedKeyframeId: null,
          selectedKeyframeIds: [],
          selectedTrackId: state.selectedTrackId,
        }),
        tracks: nextTracks,
      }
    })
  },

  nudgeSelectedKeyframes: (delta) => {
    if (!Number.isFinite(delta) || Math.abs(delta) <= Number.EPSILON) {
      return
    }

    set((state) => {
      if (state.selectedKeyframeIds.length === 0) {
        return state
      }

      const selectedKeyframeIdSet = new Set(state.selectedKeyframeIds)

      return {
        tracks: state.tracks.map((track) => {
          if (!track.keyframes.some((keyframe) => selectedKeyframeIdSet.has(keyframe.id))) {
            return track
          }

          return {
            ...track,
            keyframes: sortKeyframes(
              track.keyframes.map((keyframe) =>
                selectedKeyframeIdSet.has(keyframe.id)
                  ? {
                      ...keyframe,
                      time: clampTime(keyframe.time + delta, state.duration),
                    }
                  : keyframe,
              ),
            ),
          }
        }),
      }
    })
  },

  pasteKeyframes: ({ items, primarySourceKeyframeId = null, targetTime }) => {
    set((state) => {
      if (items.length === 0) {
        return state
      }

      const nextTracks = cloneTracks(state.tracks)
      const trackIndexById = new Map(nextTracks.map((track, index) => [track.id, index]))
      const anchorTime = clampTime(targetTime ?? state.currentTime, state.duration)
      const pastedKeyframeIds: string[] = []
      let primaryPastedKeyframeId: string | null = null
      let primaryPastedTrackId: string | null = null

      for (const item of items) {
        const trackIndex = trackIndexById.get(item.sourceTrackId)

        if (trackIndex === undefined) {
          continue
        }

        const track = nextTracks[trackIndex]

        if (!track) {
          continue
        }

        const nextTime = clampTime(anchorTime + item.relativeTime, state.duration)
        const existingKeyframe = track.keyframes.find(
          (keyframe) => Math.abs(keyframe.time - nextTime) <= TIME_EPSILON,
        )

        if (existingKeyframe) {
          existingKeyframe.easing = cloneEasing(item.easing)
          existingKeyframe.value = cloneParameterValue(item.value)
          pastedKeyframeIds.push(existingKeyframe.id)

          if (item.sourceKeyframeId === primarySourceKeyframeId) {
            primaryPastedKeyframeId = existingKeyframe.id
            primaryPastedTrackId = track.id
          }

          continue
        }

        const keyframeId = crypto.randomUUID()
        track.keyframes = sortKeyframes([
          ...track.keyframes,
          {
            easing: cloneEasing(item.easing),
            id: keyframeId,
            time: nextTime,
            value: cloneParameterValue(item.value),
          },
        ])

        pastedKeyframeIds.push(keyframeId)

        if (item.sourceKeyframeId === primarySourceKeyframeId) {
          primaryPastedKeyframeId = keyframeId
          primaryPastedTrackId = track.id
        }
      }

      if (pastedKeyframeIds.length === 0) {
        return state
      }

      return {
        ...sanitizeSelectionState(nextTracks, {
          selectedKeyframeId: primaryPastedKeyframeId ?? pastedKeyframeIds[0] ?? null,
          selectedKeyframeIds: pastedKeyframeIds,
          selectedTrackId: primaryPastedTrackId ?? state.selectedTrackId,
        }),
        tracks: nextTracks,
      }
    })
  },

  clearLayerTracks: (layerId) => {
    set((state) => {
      const nextTracks = state.tracks.filter((track) => track.layerId !== layerId)

      return {
        ...sanitizeSelectionState(nextTracks, {
          selectedKeyframeId: state.selectedKeyframeId,
          selectedKeyframeIds: state.selectedKeyframeIds,
          selectedTrackId: state.selectedTrackId,
        }),
        tracks: nextTracks,
      }
    })
  },

  pruneTracks: (layers) => {
    const layerById = new Map(layers.map((layer) => [layer.id, layer]))

    set((state) => {
      const nextTracks = state.tracks.filter((track) => {
        const layer = layerById.get(track.layerId)

        if (!layer) {
          return false
        }

        if (track.binding.kind === "layer") {
          return true
        }

        const definition = getParameterDefinition(getLayerDefinition(layer.type).params, track.binding.key)

        return Boolean(definition && isAnimatableValueType(definition.type))
      })

      return {
        ...sanitizeSelectionState(nextTracks, {
          selectedKeyframeId: state.selectedKeyframeId,
          selectedKeyframeIds: state.selectedKeyframeIds,
          selectedTrackId: state.selectedTrackId,
        }),
        tracks: nextTracks,
      }
    })
  },

  getTrackForBinding: (layerId, binding) => {
    return (
      get().tracks.find(
        (track) => track.layerId === layerId && bindingEquals(track.binding, binding),
      ) ?? null
    )
  },

  replaceState: (nextState) => {
    // Migrate legacy track-level interpolation to per-keyframe easing
    const migratedTracks = cloneTracks(nextState.tracks).map(migrateTrackEasing)
    const nextSelection = sanitizeSelectionState(migratedTracks, {
      selectedKeyframeId: nextState.selectedKeyframeId,
      selectedKeyframeIds: nextState.selectedKeyframeIds ?? [],
      selectedTrackId: nextState.selectedTrackId,
    })

    set({
      currentTime: clampTime(nextState.currentTime, nextState.duration),
      duration: clampDuration(nextState.duration),
      isPlaying: nextState.isPlaying,
      loop: nextState.loop,
      selectedKeyframeId: nextSelection.selectedKeyframeId,
      selectedKeyframeIds: nextSelection.selectedKeyframeIds,
      selectedTrackId: nextSelection.selectedTrackId,
      tracks: migratedTracks,
    })
  },
}))
