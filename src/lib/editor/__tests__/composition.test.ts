import { describe, expect, test } from "bun:test"
import {
  getCenteredCropFrame,
  getCompositionFrame,
  intersectCompositionFrames,
} from "@/lib/editor/composition"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

describe("getCenteredCropFrame", () => {
  test("ratio null returns the full canvas at the origin", () => {
    expect(getCenteredCropFrame({ height: 1080, width: 1920 }, null)).toEqual({
      height: 1080,
      width: 1920,
      x: 0,
      y: 0,
    })
  })

  test("wide ratio in a tall canvas spans full width, centered vertically", () => {
    const frame = getCenteredCropFrame(
      { height: 1920, width: 1080 },
      16 / 9
    )

    expect(frame.width).toBe(1080)
    expect(frame.height).toBe(Math.round(1080 / (16 / 9)))
    expect(frame.x).toBe(0)
    expect(frame.y).toBe(Math.round((1920 - frame.height) / 2))
  })

  test("tall ratio in a wide canvas spans full height, centered horizontally", () => {
    const frame = getCenteredCropFrame(
      { height: 1080, width: 1920 },
      9 / 16
    )

    expect(frame.height).toBe(1080)
    expect(frame.width).toBe(Math.round(1080 * (9 / 16)))
    expect(frame.y).toBe(0)
    expect(frame.x).toBe(Math.round((1920 - frame.width) / 2))
  })

  test("degenerate 0x0 canvas is clamped to a minimum of 1x1 with no NaN", () => {
    const fullFrame = getCenteredCropFrame({ height: 0, width: 0 }, null)

    expect(fullFrame).toEqual({ height: 1, width: 1, x: 0, y: 0 })

    const croppedFrame = getCenteredCropFrame({ height: 0, width: 0 }, 16 / 9)

    expect(croppedFrame.width).toBe(1)
    expect(croppedFrame.height).toBeGreaterThanOrEqual(1)
    expect(Number.isNaN(croppedFrame.x)).toBe(false)
    expect(Number.isNaN(croppedFrame.y)).toBe(false)
  })
})

describe("intersectCompositionFrames", () => {
  test("overlapping frames intersect", () => {
    const left = { height: 100, width: 100, x: 0, y: 0 }
    const right = { height: 100, width: 100, x: 50, y: 50 }

    expect(intersectCompositionFrames(left, right)).toEqual({
      height: 50,
      width: 50,
      x: 50,
      y: 50,
    })
  })

  test("a frame contained in another intersects to the inner frame", () => {
    const outer = { height: 1080, width: 1920, x: 0, y: 0 }
    const inner = { height: 200, width: 300, x: 100, y: 100 }

    expect(intersectCompositionFrames(outer, inner)).toEqual(inner)
  })

  test("non-overlapping frames collapse to a 1x1 frame at the max origin", () => {
    // The implementation clamps width/height to >= 1 and keeps
    // x/y at max(left, right), so disjoint inputs do not produce
    // negative sizes — they degrade to a 1x1 frame.
    const left = { height: 10, width: 10, x: 0, y: 0 }
    const right = { height: 5, width: 5, x: 20, y: 20 }

    expect(intersectCompositionFrames(left, right)).toEqual({
      height: 1,
      width: 1,
      x: 20,
      y: 20,
    })
  })
})

describe("getCompositionFrame", () => {
  test("screen aspect returns the full canvas", () => {
    const frame = getCompositionFrame(DEFAULT_SCENE_CONFIG, {
      height: 900,
      width: 1440,
    })

    expect(frame).toEqual({ height: 900, width: 1440, x: 0, y: 0 })
  })

  test("16:9 aspect crops a tall canvas", () => {
    const frame = getCompositionFrame(
      { ...DEFAULT_SCENE_CONFIG, compositionAspect: "16:9" },
      { height: 1920, width: 1080 }
    )

    expect(frame.width).toBe(1080)
    expect(frame.height).toBe(Math.round(1080 / (16 / 9)))
  })
})
