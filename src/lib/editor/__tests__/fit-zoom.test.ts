import { describe, expect, test } from "bun:test"
import {
  computeFitZoom,
  MOBILE_CANVAS_BOTTOM_INSET,
  ZOOM_MIN,
} from "@/lib/editor/view-transform"

describe("computeFitZoom", () => {
  test("fits a tall composition into a phone viewport", () => {
    const zoom = computeFitZoom({
      compositionHeight: 1920,
      compositionWidth: 1080,
      insetBottom: MOBILE_CANVAS_BOTTOM_INSET,
      viewportHeight: 844,
      viewportWidth: 390,
    })

    expect(zoom).not.toBeNull()
    expect(1080 * (zoom ?? 0)).toBeLessThanOrEqual(390)
    expect(1920 * (zoom ?? 0)).toBeLessThanOrEqual(844 - MOBILE_CANVAS_BOTTOM_INSET)
  })

  test("leaves room for the chrome that overlays the canvas", () => {
    const withInset = computeFitZoom({
      compositionHeight: 1000,
      compositionWidth: 1000,
      insetBottom: MOBILE_CANVAS_BOTTOM_INSET,
      viewportHeight: 844,
      viewportWidth: 390,
    })
    const without = computeFitZoom({
      compositionHeight: 1000,
      compositionWidth: 1000,
      viewportHeight: 844,
      viewportWidth: 390,
    })

    expect(withInset).toBeLessThanOrEqual(without ?? 0)
  })

  test("picks the constraining axis", () => {
    const wide = computeFitZoom({
      compositionHeight: 100,
      compositionWidth: 1000,
      viewportHeight: 800,
      viewportWidth: 400,
    })

    expect(wide).toBeCloseTo((400 - 32) / 1000, 5)
  })

  test("cannot fit a composition so wide that ZOOM_MIN takes over", () => {
    const zoom = computeFitZoom({
      compositionHeight: 100,
      compositionWidth: 40000,
      viewportHeight: 800,
      viewportWidth: 400,
    })

    expect(zoom).toBe(ZOOM_MIN)
    expect(40000 * ZOOM_MIN).toBeGreaterThan(400)
  })

  test("never returns more than 1:1 for a composition that already fits", () => {
    const zoom = computeFitZoom({
      compositionHeight: 100,
      compositionWidth: 100,
      viewportHeight: 2000,
      viewportWidth: 2000,
    })

    expect(zoom).toBeGreaterThan(1)
  })

  test("refuses a viewport with no usable room", () => {
    expect(
      computeFitZoom({
        compositionHeight: 100,
        compositionWidth: 100,
        insetBottom: 900,
        viewportHeight: 800,
        viewportWidth: 400,
      })
    ).toBeNull()
  })

  test("refuses a composition with no size", () => {
    expect(
      computeFitZoom({
        compositionHeight: 0,
        compositionWidth: 0,
        viewportHeight: 800,
        viewportWidth: 400,
      })
    ).toBeNull()
  })

  test("stays inside the zoom clamp", () => {
    const tiny = computeFitZoom({
      compositionHeight: 100000,
      compositionWidth: 100000,
      viewportHeight: 800,
      viewportWidth: 400,
    })

    expect(tiny).toBe(ZOOM_MIN)
  })
})
