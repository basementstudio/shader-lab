import { beforeEach, describe, expect, test } from "bun:test"
import { MAX_DURATION, MIN_DURATION } from "@/lib/editor/timeline-duration"
import { useTimelineStore } from "@/store/timeline-store"

function keyframeTimes(): number[] {
  return useTimelineStore
    .getState()
    .tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.time))
}

describe("setDuration", () => {
  beforeEach(() => {
    useTimelineStore.getState().replaceState({
      currentTime: 0,
      duration: 200,
      isPlaying: false,
      loop: true,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: [
        {
          binding: { key: "opacity", kind: "param" },
          enabled: true,
          id: "track-1",
          keyframes: [
            { easing: null, id: "k0", time: 0, value: 0 },
            { easing: null, id: "k1", time: 90, value: 1 },
            { easing: null, id: "k2", time: 180, value: 0 },
          ],
          layerId: "layer-1",
          valueType: "number",
        },
      ],
      // biome-ignore lint/suspicious/noExplicitAny: test fixture
    } as any)
  })

  test("accepts a full-length song", () => {
    useTimelineStore.getState().setDuration(247.5)
    expect(useTimelineStore.getState().duration).toBe(247.5)
  })

  test("clamps to the supported range", () => {
    useTimelineStore.getState().setDuration(MAX_DURATION * 10)
    expect(useTimelineStore.getState().duration).toBe(MAX_DURATION)

    useTimelineStore.getState().setDuration(0)
    expect(useTimelineStore.getState().duration).toBe(MIN_DURATION)
  })

  test("shrinking leaves keyframes where they are", () => {
    useTimelineStore.getState().setDuration(30)
    expect(keyframeTimes()).toEqual([0, 90, 180])
  })

  test("keyframes are recoverable after shrinking and expanding again", () => {
    useTimelineStore.getState().setDuration(30)
    useTimelineStore.getState().setDuration(200)
    expect(keyframeTimes()).toEqual([0, 90, 180])
  })

  test("pulls the playhead back inside the new range", () => {
    useTimelineStore.getState().setCurrentTime(150)
    useTimelineStore.getState().setDuration(30)
    expect(useTimelineStore.getState().currentTime).toBe(30)
  })
})
