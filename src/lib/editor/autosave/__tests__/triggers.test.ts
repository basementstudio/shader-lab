import { describe, expect, test } from "bun:test"
import {
  audioChanged,
  editorChanged,
  layersChanged,
  releasedInteractiveEdit,
  timelineChanged,
} from "@/lib/editor/autosave/triggers"

const tracks: unknown[] = []
const bands = {}
const links: unknown[] = []
const sceneConfig = {}
const outputSize = { height: 1080, width: 1920 }

function timeline(extra?: Record<string, unknown>) {
  return { duration: 10, loop: true, tracks, ...extra }
}

describe("timelineChanged", () => {
  test("ignores a playhead tick, which fires every frame during playback", () => {
    const a = timeline({ currentTime: 0 })
    const b = timeline({ currentTime: 0.0167 })

    expect(timelineChanged(a, b)).toBe(false)
  })

  test("ignores play and pause", () => {
    expect(
      timelineChanged(timeline({ isPlaying: true }), timeline({ isPlaying: false }))
    ).toBe(false)
  })

  test("ignores keyframe selection", () => {
    expect(
      timelineChanged(
        timeline({ selectedKeyframeId: null, selectedTrackId: null }),
        timeline({ selectedKeyframeId: "k1", selectedTrackId: "t1" })
      )
    ).toBe(false)
  })

  test("a whole playthrough at 60fps never triggers a save", () => {
    let triggers = 0
    let previous = timeline({ currentTime: 0 })

    for (let frame = 1; frame <= 600; frame++) {
      const next = timeline({ currentTime: frame / 60 })

      if (timelineChanged(previous, next)) {
        triggers += 1
      }

      previous = next
    }

    expect(triggers).toBe(0)
  })

  test("still catches duration, loop and track edits", () => {
    expect(timelineChanged(timeline(), timeline({ duration: 20 }))).toBe(true)
    expect(timelineChanged(timeline(), timeline({ loop: false }))).toBe(true)
    expect(timelineChanged(timeline(), { ...timeline(), tracks: [{}] })).toBe(
      true
    )
  })
})

describe("layersChanged", () => {
  const layers: unknown[] = []

  test("ignores hover, which fires on every pointer move over the sidebar", () => {
    expect(
      layersChanged(
        { hoveredLayerId: null, layers, selectedLayerId: "a" } as never,
        { hoveredLayerId: "b", layers, selectedLayerId: "a" } as never
      )
    ).toBe(false)
  })

  test("catches a new layer array and a selection change", () => {
    expect(layersChanged({ layers, selectedLayerId: "a" }, { layers: [{}], selectedLayerId: "a" })).toBe(true)
    expect(layersChanged({ layers, selectedLayerId: "a" }, { layers, selectedLayerId: "b" })).toBe(true)
  })
})

describe("editorChanged", () => {
  test("ignores zoom, pan and canvas size, which churn while dragging", () => {
    expect(
      editorChanged(
        { canvasSize: { height: 1, width: 1 }, outputSize, panOffset: { x: 0, y: 0 }, sceneConfig, zoom: 1 } as never,
        { canvasSize: { height: 9, width: 9 }, outputSize, panOffset: { x: 5, y: 5 }, sceneConfig, zoom: 2 } as never
      )
    ).toBe(false)
  })

  test("catches scene config and output size", () => {
    expect(editorChanged({ outputSize, sceneConfig }, { outputSize, sceneConfig: {} })).toBe(true)
    expect(
      editorChanged({ outputSize, sceneConfig }, { outputSize: { height: 720, width: 1280 }, sceneConfig })
    ).toBe(true)
  })
})

describe("audioChanged", () => {
  test("ignores analysis output that updates continuously", () => {
    expect(
      audioChanged(
        { bands, envelopes: {}, links, offsetSeconds: 0, source: null, spectrogram: null, status: "idle" } as never,
        { bands, envelopes: { bass: 1 }, links, offsetSeconds: 0, source: null, spectrogram: [1], status: "ready" } as never
      )
    ).toBe(false)
  })

  test("catches the parts that are saved", () => {
    expect(audioChanged({ bands, links, offsetSeconds: 0, source: null }, { bands: {}, links, offsetSeconds: 0, source: null })).toBe(true)
    expect(audioChanged({ bands, links, offsetSeconds: 0, source: null }, { bands, links, offsetSeconds: 2, source: null })).toBe(true)
  })
})

describe("releasedInteractiveEdit", () => {
  test("fires only on the transition back to zero", () => {
    expect(
      releasedInteractiveEdit({ interactiveEditDepth: 0 }, { interactiveEditDepth: 1 })
    ).toBe(true)
    expect(
      releasedInteractiveEdit({ interactiveEditDepth: 1 }, { interactiveEditDepth: 2 })
    ).toBe(false)
    expect(
      releasedInteractiveEdit({ interactiveEditDepth: 1 }, { interactiveEditDepth: 0 })
    ).toBe(false)
  })
})
