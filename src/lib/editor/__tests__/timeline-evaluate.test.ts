import { describe, expect, test } from "bun:test"
import {
  type KeyframeEasing,
  LINEAR_EASING,
  STEP_EASING,
} from "@/lib/easing-curve"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import type {
  AnimatableValueType,
  EditorLayer,
  ParameterValue,
  TimelineKeyframe,
  TimelineTrack,
} from "@/types/editor"

function createLayer(id: string): EditorLayer {
  return {
    assetId: null,
    blendMode: "normal",
    compositeMode: "filter",
    expanded: false,
    hue: 0,
    id,
    kind: "effect",
    locked: false,
    maskConfig: { invert: false, mode: "multiply", source: "luminance" },
    name: "Test Layer",
    opacity: 1,
    params: {},
    runtimeError: null,
    saturation: 1,
    type: "posterize",
    visible: true,
  }
}

function createKeyframe(
  id: string,
  time: number,
  value: ParameterValue,
  easing: KeyframeEasing = LINEAR_EASING
): TimelineKeyframe {
  return { easing, id, time, value }
}

function createParamTrack(
  layerId: string,
  key: string,
  valueType: AnimatableValueType,
  keyframes: TimelineKeyframe[]
): TimelineTrack {
  return {
    binding: { key, kind: "param", label: key, valueType },
    enabled: true,
    id: `track-${layerId}-${key}`,
    keyframes,
    layerId,
  }
}

describe("evaluateTimelineForLayers", () => {
  test("returns an empty array when there are no tracks", () => {
    expect(evaluateTimelineForLayers([createLayer("a")], [], 0)).toEqual([])
  })

  test("ignores tracks whose layer does not exist", () => {
    const track = createParamTrack("missing-layer", "amount", "number", [
      createKeyframe("k1", 0, 0),
      createKeyframe("k2", 1, 10),
    ])

    expect(
      evaluateTimelineForLayers([createLayer("a")], [track], 0.5)
    ).toEqual([])
  })

  test("ignores disabled tracks", () => {
    const track = {
      ...createParamTrack("a", "amount", "number", [
        createKeyframe("k1", 0, 0),
        createKeyframe("k2", 1, 10),
      ]),
      enabled: false,
    }

    expect(
      evaluateTimelineForLayers([createLayer("a")], [track], 0.5)
    ).toEqual([])
  })

  describe("numeric interpolation with linear easing", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 0, 0),
      createKeyframe("k2", 1, 10),
    ])

    test("at t=0 returns the first keyframe value", () => {
      expect(evaluateTimelineForLayers([layer], [track], 0)).toEqual([
        { layerId: "a", params: { amount: 0 }, properties: {} },
      ])
    })

    test("at t=1 returns the last keyframe value", () => {
      expect(evaluateTimelineForLayers([layer], [track], 1)).toEqual([
        { layerId: "a", params: { amount: 10 }, properties: {} },
      ])
    })

    test("at t=0.5 returns the linear midpoint", () => {
      expect(evaluateTimelineForLayers([layer], [track], 0.5)).toEqual([
        { layerId: "a", params: { amount: 5 }, properties: {} },
      ])
    })
  })

  test("step easing holds the from-keyframe value until the next keyframe", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 0, 0, STEP_EASING),
      createKeyframe("k2", 1, 10, STEP_EASING),
    ])

    expect(evaluateTimelineForLayers([layer], [track], 0.99)).toEqual([
      { layerId: "a", params: { amount: 0 }, properties: {} },
    ])
    expect(evaluateTimelineForLayers([layer], [track], 1)).toEqual([
      { layerId: "a", params: { amount: 10 }, properties: {} },
    ])
  })

  test("interpolates hex colors channel-wise with rounding", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "tint", "color", [
      createKeyframe("k1", 0, "#000000"),
      createKeyframe("k2", 1, "#ffffff"),
    ])

    // lerp(0, 255, 0.5) = 127.5; toHex rounds to 128 = 0x80.
    expect(evaluateTimelineForLayers([layer], [track], 0.5)).toEqual([
      { layerId: "a", params: { tint: "#808080" }, properties: {} },
    ])
  })

  test("interpolates vec2 tuples component-wise", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "offset", "vec2", [
      createKeyframe("k1", 0, [0, 0]),
      createKeyframe("k2", 1, [10, 20]),
    ])

    expect(evaluateTimelineForLayers([layer], [track], 0.5)).toEqual([
      { layerId: "a", params: { offset: [5, 10] }, properties: {} },
    ])
  })

  test("clamps to the first keyframe value before the first keyframe", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 1, 3),
      createKeyframe("k2", 2, 7),
    ])

    expect(evaluateTimelineForLayers([layer], [track], 0)).toEqual([
      { layerId: "a", params: { amount: 3 }, properties: {} },
    ])
  })

  test("clamps to the last keyframe value after the last keyframe", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 1, 3),
      createKeyframe("k2", 2, 7),
    ])

    expect(evaluateTimelineForLayers([layer], [track], 5)).toEqual([
      { layerId: "a", params: { amount: 7 }, properties: {} },
    ])
  })

  test("a single-keyframe track always yields that keyframe's value", () => {
    const layer = createLayer("a")
    const track = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 1, 3),
    ])

    expect(evaluateTimelineForLayers([layer], [track], 0)).toEqual([
      { layerId: "a", params: { amount: 3 }, properties: {} },
    ])
    expect(evaluateTimelineForLayers([layer], [track], 9)).toEqual([
      { layerId: "a", params: { amount: 3 }, properties: {} },
    ])
  })

  test("layer property bindings land in properties, not params", () => {
    const layer = createLayer("a")
    const track: TimelineTrack = {
      binding: {
        kind: "layer",
        label: "Opacity",
        property: "opacity",
        valueType: "number",
      },
      enabled: true,
      id: "track-a-opacity",
      keyframes: [createKeyframe("k1", 0, 0), createKeyframe("k2", 1, 1)],
      layerId: "a",
    }

    expect(evaluateTimelineForLayers([layer], [track], 0.5)).toEqual([
      { layerId: "a", params: {}, properties: { opacity: 0.5 } },
    ])
  })

  test("merges multiple tracks for the same layer into one state", () => {
    const layer = createLayer("a")
    const amountTrack = createParamTrack("a", "amount", "number", [
      createKeyframe("k1", 0, 0),
      createKeyframe("k2", 1, 10),
    ])
    const offsetTrack = createParamTrack("a", "offset", "vec2", [
      createKeyframe("k3", 0, [0, 0]),
      createKeyframe("k4", 1, [2, 2]),
    ])

    expect(
      evaluateTimelineForLayers([layer], [amountTrack, offsetTrack], 0.5)
    ).toEqual([
      {
        layerId: "a",
        params: { amount: 5, offset: [1, 1] },
        properties: {},
      },
    ])
  })
})
