import { describe, expect, test } from "bun:test"
import { createDefaultAudioBands } from "@/lib/editor/audio/bands"
import { getHistorySnapshotSignature } from "@/lib/editor/history"
import { LINEAR_EASING } from "@/lib/easing-curve"
import type { EditorHistorySnapshot } from "@/types/editor"

function createSnapshot(): EditorHistorySnapshot {
  return {
    audio: {
      bands: createDefaultAudioBands(),
      links: [],
      offsetSeconds: 0,
      source: null,
    },
    hoveredLayerId: null,
    layers: [],
    selectedLayerId: null,
    timeline: {
      currentTime: 0,
      duration: 8,
      loop: true,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: [],
    },
  }
}

describe("getHistorySnapshotSignature", () => {
  test("ignores the playhead position", () => {
    // Regression guard: while the timeline plays, `currentTime` changes every
    // frame. When it was part of the signature, every frame re-armed the commit
    // debounce so it never fired — edits made during playback were never
    // committed to history, and the next undo discarded them.
    const before = createSnapshot()
    const after = createSnapshot()
    after.timeline.currentTime = 4.271

    expect(getHistorySnapshotSignature(after)).toBe(
      getHistorySnapshotSignature(before)
    )
  })

  test("ignores selection state", () => {
    const before = createSnapshot()
    const after = createSnapshot()
    after.timeline.selectedTrackId = "track-1"
    after.timeline.selectedKeyframeIds = ["k1"]

    expect(getHistorySnapshotSignature(after)).toBe(
      getHistorySnapshotSignature(before)
    )
  })

  test("reacts to audio links, so audio edits stay undoable", () => {
    const before = createSnapshot()
    const after = createSnapshot()
    after.audio.links = [
      {
        band: "bass",
        binding: {
          key: "speed",
          kind: "param",
          label: "Speed",
          valueType: "number",
        },
        enabled: true,
        id: "link-1",
        layerId: "layer-1",
        outMax: 1,
        outMin: 0,
      },
    ]

    expect(getHistorySnapshotSignature(after)).not.toBe(
      getHistorySnapshotSignature(before)
    )
  })

  test("reacts to an audio output range change", () => {
    const before = createSnapshot()
    const link = {
      band: "bass" as const,
      binding: {
        key: "speed",
        kind: "param" as const,
        label: "Speed",
        valueType: "number" as const,
      },
      enabled: true,
      id: "link-1",
      layerId: "layer-1",
      outMax: 1,
      outMin: 0,
    }
    before.audio.links = [link]

    const after = createSnapshot()
    after.audio.links = [{ ...link, outMax: 140 }]

    expect(getHistorySnapshotSignature(after)).not.toBe(
      getHistorySnapshotSignature(before)
    )
  })

  test("reacts to band config changes", () => {
    const before = createSnapshot()
    const after = createSnapshot()
    after.audio.bands.bass = { ...after.audio.bands.bass, lowHz: 40 }

    expect(getHistorySnapshotSignature(after)).not.toBe(
      getHistorySnapshotSignature(before)
    )
  })

  test("still reacts to real timeline edits", () => {
    const before = createSnapshot()

    const durationChanged = createSnapshot()
    durationChanged.timeline.duration = 12
    expect(getHistorySnapshotSignature(durationChanged)).not.toBe(
      getHistorySnapshotSignature(before)
    )

    const trackAdded = createSnapshot()
    trackAdded.timeline.tracks = [
      {
        binding: {
          key: "speed",
          kind: "param",
          label: "Speed",
          valueType: "number",
        },
        enabled: true,
        id: "track-1",
        keyframes: [{ easing: LINEAR_EASING, id: "k1", time: 0, value: 0 }],
        layerId: "layer-1",
      },
    ]
    expect(getHistorySnapshotSignature(trackAdded)).not.toBe(
      getHistorySnapshotSignature(before)
    )
  })
})
