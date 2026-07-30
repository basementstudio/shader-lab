import { describe, expect, test } from "bun:test"
import { createAudioLink } from "@/lib/editor/audio/links"
import {
  remapBand,
  resolveAudioLinkValue,
  resolveBooleanValue,
  resolveLayerPropertyValue,
  resolveNumberValue,
  resolveVectorValue,
} from "@/lib/editor/audio/modulate"
import type { AudioLink, ParameterDefinition } from "@/types/editor"

function makeLink(overrides: Partial<AudioLink> = {}): AudioLink {
  return {
    ...createAudioLink({
      band: "bass",
      binding: { key: "strength", kind: "param", label: "Strength", valueType: "number" },
      id: "link-1",
      layerId: "layer-1",
      outMax: 1,
      outMin: 0,
    }),
    ...overrides,
  }
}

const boundedNumber: ParameterDefinition = {
  defaultValue: 0.5,
  key: "strength",
  label: "Strength",
  max: 2,
  min: -1,
  step: 0.25,
  type: "number",
}

const unboundedNumber: ParameterDefinition = {
  defaultValue: 1,
  key: "scale",
  label: "Scale",
  type: "number",
}

const intNumber: ParameterDefinition = {
  defaultValue: 3,
  input: "int",
  key: "count",
  label: "Count",
  max: 8,
  min: 1,
  step: 1,
  type: "number",
}

const vec2Definition: ParameterDefinition = {
  defaultValue: [0, 0],
  key: "offset",
  label: "Offset",
  max: 1,
  min: -1,
  step: 0.01,
  type: "vec2",
}

describe("remapBand", () => {
  test("maps the band range onto the output range", () => {
    expect(remapBand(0, 10, 20)).toBe(10)
    expect(remapBand(1, 10, 20)).toBe(20)
    expect(remapBand(0.5, 10, 20)).toBe(15)
  })

  test("supports an inverted range", () => {
    expect(remapBand(0, 20, 10)).toBe(20)
    expect(remapBand(1, 20, 10)).toBe(10)
  })

  test("clamps band values outside [0,1]", () => {
    expect(remapBand(-5, 0, 1)).toBe(0)
    expect(remapBand(5, 0, 1)).toBe(1)
  })

  test("falls back to outMin for non-finite input", () => {
    expect(remapBand(Number.NaN, 3, 9)).toBe(3)
  })
})

describe("resolveNumberValue", () => {
  test("clamps to declared bounds", () => {
    const link = makeLink({ outMax: 99, outMin: -99 })

    expect(resolveNumberValue(link, boundedNumber, 1)).toBe(2)
    expect(resolveNumberValue(link, boundedNumber, 0)).toBe(-1)
  })

  test("does not invent bounds the definition omits", () => {
    // The sidebar's min 0 / max 100 slider fallback must not leak in here.
    const link = makeLink({ outMax: 5000, outMin: 0 })

    expect(resolveNumberValue(link, unboundedNumber, 1)).toBe(5000)
  })

  test("does not quantize to step by default", () => {
    const link = makeLink({ outMax: 1, outMin: 0 })

    expect(resolveNumberValue(link, boundedNumber, 0.5)).toBeCloseTo(0.5, 6)
  })

  test("quantizes only when the link opts in", () => {
    const link = makeLink({ outMax: 1, outMin: 0, quantize: true })

    // step 0.25 -> 0.6 snaps to 0.5
    expect(resolveNumberValue(link, boundedNumber, 0.6)).toBeCloseTo(0.5, 6)
  })

  test("rounds integer inputs", () => {
    const link = makeLink({ outMax: 8, outMin: 1 })
    const value = resolveNumberValue(link, intNumber, 0.5)

    expect(Number.isInteger(value)).toBe(true)
  })

  test("re-clamps after rounding pushes past a bound", () => {
    const link = makeLink({ outMax: 8.4, outMin: 8.4 })

    expect(resolveNumberValue(link, intNumber, 0.5)).toBeLessThanOrEqual(8)
  })
})

describe("resolveVectorValue", () => {
  test("drives every component when component is 'all'", () => {
    const link = makeLink({ component: "all", outMax: 1, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, [0, 0], 1)).toEqual([1, 1])
  })

  test("drives every component when component is omitted", () => {
    const link = makeLink({ outMax: 1, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, [0, 0], 1)).toEqual([1, 1])
  })

  test("merges a single component into the base, preserving the other axis", () => {
    const link = makeLink({ component: "x", outMax: 1, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, [-0.5, 0.25], 1)).toEqual([
      1, 0.25,
    ])
  })

  test("never mutates or aliases the base tuple", () => {
    const base: [number, number] = [-0.5, 0.25]
    const link = makeLink({ component: "x", outMax: 1, outMin: 0 })

    const result = resolveVectorValue(link, vec2Definition, base, 1)

    expect(result).not.toBe(base)
    expect(base).toEqual([-0.5, 0.25])
  })

  test("returns null for a component the vector does not have", () => {
    const link = makeLink({ component: "z", outMax: 1, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, [0, 0], 1)).toBeNull()
  })

  test("drives all components when the base is unusable", () => {
    const link = makeLink({ component: "x", outMax: 1, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, 5, 1)).toEqual([1, 1])
  })

  test("clamps components to the definition bounds", () => {
    const link = makeLink({ component: "all", outMax: 99, outMin: 0 })

    expect(resolveVectorValue(link, vec2Definition, [0, 0], 1)).toEqual([1, 1])
  })
})

describe("resolveBooleanValue", () => {
  test("gates at 0.5 by default", () => {
    const link = makeLink()

    expect(resolveBooleanValue(link, 0.49)).toBe(false)
    expect(resolveBooleanValue(link, 0.5)).toBe(true)
  })

  test("honours a custom threshold", () => {
    const link = makeLink({ threshold: 0.8 })

    expect(resolveBooleanValue(link, 0.79)).toBe(false)
    expect(resolveBooleanValue(link, 0.81)).toBe(true)
  })
})

describe("resolveLayerPropertyValue", () => {
  test("clamps opacity to [0,1]", () => {
    const link = makeLink({ outMax: 50, outMin: -50 })

    expect(resolveLayerPropertyValue(link, "opacity", 1)).toBe(1)
    expect(resolveLayerPropertyValue(link, "opacity", 0)).toBe(0)
  })

  test("clamps hue to [-180,180]", () => {
    const link = makeLink({ outMax: 900, outMin: -900 })

    expect(resolveLayerPropertyValue(link, "hue", 1)).toBe(180)
    expect(resolveLayerPropertyValue(link, "hue", 0)).toBe(-180)
  })

  test("clamps saturation to [0,2]", () => {
    const link = makeLink({ outMax: 50, outMin: -50 })

    expect(resolveLayerPropertyValue(link, "saturation", 1)).toBe(2)
  })

  test("gates visible as a boolean", () => {
    const link = makeLink()

    expect(resolveLayerPropertyValue(link, "visible", 0.9)).toBe(true)
    expect(resolveLayerPropertyValue(link, "visible", 0.1)).toBe(false)
  })
})

describe("resolveAudioLinkValue", () => {
  test("routes layer bindings without needing a definition", () => {
    const link = makeLink({
      binding: {
        kind: "layer",
        label: "Opacity",
        property: "opacity",
        valueType: "number",
      },
      outMax: 1,
      outMin: 0,
    })

    expect(resolveAudioLinkValue(link, null, undefined, 1)).toBe(1)
  })

  test("returns null for a param binding with no definition", () => {
    expect(resolveAudioLinkValue(makeLink(), null, undefined, 1)).toBeNull()
  })

  test("returns null for colour and select parameters", () => {
    const colorDefinition: ParameterDefinition = {
      defaultValue: "#ffffff",
      key: "tint",
      label: "Tint",
      type: "color",
    }

    expect(
      resolveAudioLinkValue(makeLink(), colorDefinition, undefined, 1)
    ).toBeNull()
  })
})
