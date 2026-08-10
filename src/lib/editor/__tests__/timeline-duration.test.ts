import { describe, expect, test } from "bun:test"
import {
  clampDuration,
  DEFAULT_DURATION,
  getLongestVideoLayerDuration,
  getSeedableMediaDuration,
  MAX_DURATION,
  MIN_DURATION,
} from "@/lib/editor/timeline-duration"
import type { EditorAsset, EditorLayer } from "@/types/editor"

function videoLayer(id: string, assetId: string): EditorLayer {
  return {
    assetId,
    hue: 0,
    id,
    kind: "source",
    name: id,
    opacity: 1,
    params: {},
    saturation: 1,
    type: "video",
    visible: true,
  } as unknown as EditorLayer
}

function videoAsset(id: string, duration: number | undefined): EditorAsset {
  return {
    duration,
    fileName: `${id}.mp4`,
    id,
    kind: "video",
    url: `blob:${id}`,
  } as unknown as EditorAsset
}

describe("clampDuration", () => {
  test("falls back to the default for non-finite input", () => {
    expect(clampDuration(Number.NaN)).toBe(DEFAULT_DURATION)
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(DEFAULT_DURATION)
  })

  test("holds the bounds", () => {
    expect(clampDuration(0)).toBe(MIN_DURATION)
    expect(clampDuration(-10)).toBe(MIN_DURATION)
    expect(clampDuration(MAX_DURATION + 1)).toBe(MAX_DURATION)
  })

  test("accepts a full-length song", () => {
    expect(clampDuration(247.5)).toBe(247.5)
  })
})

describe("getLongestVideoLayerDuration", () => {
  test("returns null with no usable video layer", () => {
    expect(getLongestVideoLayerDuration([], [])).toBeNull()
    expect(
      getLongestVideoLayerDuration(
        [videoLayer("a", "asset-a")],
        [videoAsset("asset-a", undefined)]
      )
    ).toBeNull()
  })

  test("takes the longest", () => {
    expect(
      getLongestVideoLayerDuration(
        [videoLayer("a", "asset-a"), videoLayer("b", "asset-b")],
        [videoAsset("asset-a", 12), videoAsset("asset-b", 30)]
      )
    ).toBe(30)
  })

  test("clamps so the ruler cannot disagree with the store", () => {
    expect(
      getLongestVideoLayerDuration(
        [videoLayer("a", "asset-a")],
        [videoAsset("asset-a", MAX_DURATION * 3)]
      )
    ).toBe(MAX_DURATION)
  })
})

describe("getSeedableMediaDuration", () => {
  test("reads video and audio durations", () => {
    expect(getSeedableMediaDuration(videoAsset("a", 42))).toBe(42)
    expect(getSeedableMediaDuration({ duration: 247.5, kind: "audio" })).toBe(
      247.5
    )
  })

  test("ignores media without a usable duration", () => {
    expect(getSeedableMediaDuration(videoAsset("a", undefined))).toBeNull()
    expect(getSeedableMediaDuration({ duration: 0, kind: "video" })).toBeNull()
    expect(
      getSeedableMediaDuration({ duration: Number.NaN, kind: "audio" })
    ).toBeNull()
    expect(
      getSeedableMediaDuration({
        duration: Number.POSITIVE_INFINITY,
        kind: "audio",
      })
    ).toBeNull()
  })

  test("never seeds from a still image", () => {
    expect(getSeedableMediaDuration({ duration: 10, kind: "image" })).toBeNull()
  })

  test("clamps out-of-range media", () => {
    expect(
      getSeedableMediaDuration({ duration: MAX_DURATION * 3, kind: "video" })
    ).toBe(MAX_DURATION)
  })
})
