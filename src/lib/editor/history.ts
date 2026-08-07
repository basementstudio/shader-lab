import type {
  EditorAudioSnapshot,
  EditorHistorySnapshot,
  TimelineStateSnapshot,
} from "@/types/editor"
import { useAudioStore } from "@/store/audio-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

type HistoryTimelineSnapshot = EditorHistorySnapshot["timeline"]

function cloneHistoryAudio(audio: EditorAudioSnapshot): EditorAudioSnapshot {
  return structuredClone({
    bands: audio.bands,
    links: audio.links,
    offsetSeconds: audio.offsetSeconds,
    source: audio.source,
  })
}

function cloneHistoryTimeline(
  timeline: Pick<
    TimelineStateSnapshot,
    | "currentTime"
    | "duration"
    | "loop"
    | "selectedKeyframeId"
    | "selectedKeyframeIds"
    | "selectedTrackId"
    | "tracks"
  >,
): HistoryTimelineSnapshot {
  return structuredClone({
    currentTime: timeline.currentTime,
    duration: timeline.duration,
    loop: timeline.loop,
    selectedKeyframeId: timeline.selectedKeyframeId,
    selectedKeyframeIds: timeline.selectedKeyframeIds,
    selectedTrackId: timeline.selectedTrackId,
    tracks: timeline.tracks,
  })
}

export function buildEditorHistorySnapshotFromState(
  layerState: Pick<
    ReturnType<typeof useLayerStore.getState>,
    "hoveredLayerId" | "layers" | "selectedLayerId"
  >,
  timelineState: Pick<
    TimelineStateSnapshot,
    | "currentTime"
    | "duration"
    | "loop"
    | "selectedKeyframeId"
    | "selectedKeyframeIds"
    | "selectedTrackId"
    | "tracks"
  >,
  audioState: EditorAudioSnapshot,
): EditorHistorySnapshot {
  return {
    audio: cloneHistoryAudio(audioState),
    hoveredLayerId: layerState.hoveredLayerId,
    layers: structuredClone(layerState.layers),
    selectedLayerId: layerState.selectedLayerId,
    timeline: cloneHistoryTimeline(timelineState),
  }
}

export function buildEditorHistorySnapshot(): EditorHistorySnapshot {
  return buildEditorHistorySnapshotFromState(
    useLayerStore.getState(),
    useTimelineStore.getState(),
    useAudioStore.getState().getSnapshot(),
  )
}

export function applyEditorHistorySnapshot(snapshot: EditorHistorySnapshot): void {
  useLayerStore
    .getState()
    .replaceState(snapshot.layers, snapshot.selectedLayerId, snapshot.hoveredLayerId)
  useTimelineStore.getState().replaceState({
    currentTime: snapshot.timeline.currentTime,
    duration: snapshot.timeline.duration,
    isPlaying: false,
    loop: snapshot.timeline.loop,
    selectedKeyframeId: snapshot.timeline.selectedKeyframeId,
    selectedKeyframeIds: snapshot.timeline.selectedKeyframeIds,
    selectedTrackId: snapshot.timeline.selectedTrackId,
    tracks: snapshot.timeline.tracks,
  })
  useAudioStore.getState().restoreSnapshot(snapshot.audio)
}

export function getHistorySnapshotSignature(snapshot: EditorHistorySnapshot): string {
  return JSON.stringify({
    audio: snapshot.audio,
    layers: snapshot.layers,
    timeline: {
      duration: snapshot.timeline.duration,
      loop: snapshot.timeline.loop,
      tracks: snapshot.timeline.tracks,
    },
  })
}
