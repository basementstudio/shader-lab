import type {
  EditorHistorySnapshot,
  TimelineStateSnapshot,
} from "@/types/editor"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

type HistoryTimelineSnapshot = EditorHistorySnapshot["timeline"]

function cloneHistoryTimeline(
  timeline: Pick<
    TimelineStateSnapshot,
    "currentTime" | "duration" | "loop" | "selectedKeyframeId" | "selectedTrackId" | "tracks"
  >,
): HistoryTimelineSnapshot {
  return structuredClone({
    currentTime: timeline.currentTime,
    duration: timeline.duration,
    loop: timeline.loop,
    selectedKeyframeId: timeline.selectedKeyframeId,
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
    "currentTime" | "duration" | "loop" | "selectedKeyframeId" | "selectedTrackId" | "tracks"
  >,
): EditorHistorySnapshot {
  return {
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
    selectedTrackId: snapshot.timeline.selectedTrackId,
    tracks: snapshot.timeline.tracks,
  })
}

export function getHistorySnapshotSignature(snapshot: EditorHistorySnapshot): string {
  return JSON.stringify({
    layers: snapshot.layers,
    timeline: snapshot.timeline,
  })
}
