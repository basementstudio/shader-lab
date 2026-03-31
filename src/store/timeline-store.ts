import { create } from "zustand"
import { advanceProjectTimeline } from "@/renderer/project-clock"
import { getDefaultProjectTimeline } from "@/lib/editor/default-project"
import type {
  AnimatedPropertyBinding,
  AnimatableValueType,
  EditorLayer,
  LayerAnimatableProperty,
  ParameterType,
  ParameterValue,
  TimelineInterpolation,
  TimelineKeyframe,
  TimelineStateSnapshot,
  TimelineTrack,
} from "@/types/editor"
import {
  cloneParameterValue,
  getParameterDefinition,
} from "@/lib/editor/parameter-schema"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"

export interface TimelineStoreState extends TimelineStateSnapshot {}

interface ToggleKeyframeInput {
  binding: AnimatedPropertyBinding
  layerId: string
  time?: number
  value: ParameterValue
}

interface UpsertKeyframeInput extends ToggleKeyframeInput {}

export interface TimelineStoreActions {
  advance: (delta: number) => void
  clearLayerTracks: (layerId: string) => void
  getTrackForBinding: (
    layerId: string,
    binding: AnimatedPropertyBinding,
  ) => TimelineTrack | null
  pruneTracks: (layers: EditorLayer[]) => void
  replaceState: (
    nextState: Pick<
      TimelineStateSnapshot,
      "currentTime" | "duration" | "isPlaying" | "loop" | "selectedKeyframeId" | "selectedTrackId" | "tracks"
    >,
  ) => void
  removeKeyframe: (trackId: string, keyframeId: string) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setLoop: (loop: boolean) => void
  setPlaying: (playing: boolean) => void
  setSelected: (trackId: string | null, keyframeId?: string | null) => void
  setTrackEnabled: (trackId: string, enabled: boolean) => void
  setTrackInterpolation: (trackId: string, interpolation: TimelineInterpolation) => void
  setKeyframeTime: (trackId: string, keyframeId: string, time: number) => void
  stop: () => void
  toggleKeyframe: (input: ToggleKeyframeInput) => void
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

function defaultInterpolationForBinding(binding: AnimatedPropertyBinding): TimelineInterpolation {
  if (binding.valueType === "boolean" || binding.valueType === "select") {
    return "step"
  }

  return "smooth"
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
  return {
    ...track,
    binding: { ...track.binding },
    keyframes: track.keyframes.map((keyframe) => ({
      ...keyframe,
      value: cloneParameterValue(keyframe.value),
    })),
  }
}

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.map(cloneTrack)
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  currentTime: 0,
  duration: DEFAULT_PROJECT_TIMELINE.duration,
  isPlaying: false,
  loop: DEFAULT_PROJECT_TIMELINE.loop,
  selectedKeyframeId: null,
  selectedTrackId: null,
  tracks: DEFAULT_PROJECT_TIMELINE.tracks,

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
    set((state) => ({
      currentTime: clampTime(currentTime, state.duration),
    }))
  },

  advance: (delta) => {
    if (!Number.isFinite(delta) || delta <= 0) {
      return
    }

    set((state) => {
      const next = advanceProjectTimeline(state, delta)

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
          selectedKeyframeId: keyframeId,
          selectedTrackId: trackId,
          tracks: [
            ...state.tracks,
            {
              binding: { ...binding },
              enabled: true,
              id: trackId,
              interpolation: defaultInterpolationForBinding(binding),
              keyframes: [
                {
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
          selectedKeyframeId:
            state.selectedKeyframeId === existingKeyframe.id
              ? null
              : state.selectedKeyframeId,
          selectedTrackId:
            nextTrack.keyframes.length === 0 && state.selectedTrackId === track.id
              ? null
              : state.selectedTrackId,
          tracks: nextTracks,
        }
      }

      const keyframeId = crypto.randomUUID()
      const nextTrack = cloneTrack(track)
      nextTrack.enabled = true
      nextTrack.keyframes = sortKeyframes([
        ...nextTrack.keyframes,
        {
          id: keyframeId,
          time: targetTime,
          value: cloneParameterValue(value),
        },
      ])

      const nextTracks = [...state.tracks]
      nextTracks[trackIndex] = nextTrack

      return {
        selectedKeyframeId: keyframeId,
        selectedTrackId: nextTrack.id,
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
          selectedKeyframeId: keyframeId,
          selectedTrackId: trackId,
          tracks: [
            ...state.tracks,
            {
              binding: { ...binding },
              enabled: true,
              id: trackId,
              interpolation: defaultInterpolationForBinding(binding),
              keyframes: [
                {
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
        const keyframeId = crypto.randomUUID()
        nextTrack.keyframes = sortKeyframes([
          ...nextTrack.keyframes,
          {
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
        selectedKeyframeId,
        selectedTrackId: nextTrack.id,
        tracks: nextTracks,
      }
    })
  },

  setTrackEnabled: (trackId, enabled) => {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, enabled } : track,
      ),
    }))
  },

  setTrackInterpolation: (trackId, interpolation) => {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, interpolation } : track,
      ),
    }))
  },

  setSelected: (selectedTrackId, selectedKeyframeId = null) => {
    set({
      selectedKeyframeId,
      selectedTrackId,
    })
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
        selectedKeyframeId:
          state.selectedKeyframeId === keyframeId ? null : state.selectedKeyframeId,
        selectedTrackId:
          state.selectedTrackId === trackId &&
          !nextTracks.some((track) => track.id === trackId)
            ? null
            : state.selectedTrackId,
        tracks: nextTracks,
      }
    })
  },

  clearLayerTracks: (layerId) => {
    set((state) => {
      const nextTracks = state.tracks.filter((track) => track.layerId !== layerId)
      const selectedTrackStillExists = nextTracks.some(
        (track) => track.id === state.selectedTrackId,
      )

      return {
        selectedKeyframeId: selectedTrackStillExists ? state.selectedKeyframeId : null,
        selectedTrackId: selectedTrackStillExists ? state.selectedTrackId : null,
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

      const selectedTrackStillExists = nextTracks.some(
        (track) => track.id === state.selectedTrackId,
      )

      return {
        selectedKeyframeId: selectedTrackStillExists ? state.selectedKeyframeId : null,
        selectedTrackId: selectedTrackStillExists ? state.selectedTrackId : null,
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
    set({
      currentTime: clampTime(nextState.currentTime, nextState.duration),
      duration: clampDuration(nextState.duration),
      isPlaying: nextState.isPlaying,
      loop: nextState.loop,
      selectedKeyframeId: nextState.selectedKeyframeId,
      selectedTrackId: nextState.selectedTrackId,
      tracks: cloneTracks(nextState.tracks),
    })
  },
}))
