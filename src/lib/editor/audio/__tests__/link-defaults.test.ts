import { describe, expect, test } from "bun:test"
import { resolveDefaultAudioLinkRange } from "@/lib/editor/audio/link-defaults"
import {
  LAYER_PROPERTY_BOUNDS,
  resolveLayerPropertyValue,
} from "@/lib/editor/audio/modulate"
import type {
  AnimatedPropertyBinding,
  AudioLink,
  LayerAnimatableProperty,
  ParameterDefinition,
} from "@/types/editor"

function layerBinding(
  property: LayerAnimatableProperty
): AnimatedPropertyBinding {
  return {
    kind: "layer",
    label: property,
    property,
    valueType: property === "visible" ? "boolean" : "number",
  }
}

function linkWithRange(range: { outMax: number; outMin: number }): AudioLink {
  return {
    band: "bass",
    binding: layerBinding("hue"),
    enabled: true,
    id: "link",
    layerId: "layer",
    outMax: range.outMax,
    outMin: range.outMin,
  }
}

describe("resolveDefaultAudioLinkRange", () => {
  test("layer properties default to their real bounds, not 0..1", () => {
    expect(resolveDefaultAudioLinkRange(layerBinding("hue"), null)).toEqual({
      outMax: 180,
      outMin: -180,
    })
    expect(
      resolveDefaultAudioLinkRange(layerBinding("saturation"), null)
    ).toEqual({ outMax: 2, outMin: 0 })
    expect(resolveDefaultAudioLinkRange(layerBinding("opacity"), null)).toEqual({
      outMax: 1,
      outMin: 0,
    })
  })

  test("every bounded layer property spans its full range at full band", () => {
    for (const property of ["hue", "opacity", "saturation"] as const) {
      const range = resolveDefaultAudioLinkRange(layerBinding(property), null)
      const link = linkWithRange(range)
      const bounds = LAYER_PROPERTY_BOUNDS[property]

      expect(resolveLayerPropertyValue(link, property, 0)).toBeCloseTo(
        bounds.min,
        5
      )
      expect(resolveLayerPropertyValue(link, property, 1)).toBeCloseTo(
        bounds.max,
        5
      )
    }
  })

  test("visible falls back to the unit range", () => {
    expect(resolveDefaultAudioLinkRange(layerBinding("visible"), null)).toEqual({
      outMax: 1,
      outMin: 0,
    })
  })

  test("param bindings take the definition's min and max", () => {
    const definition = {
      defaultValue: 1,
      key: "scale",
      label: "Scale",
      max: 4,
      min: 0.5,
      type: "number",
    } as unknown as ParameterDefinition

    const binding: AnimatedPropertyBinding = {
      key: "scale",
      kind: "param",
      label: "Scale",
      valueType: "number",
    }

    expect(resolveDefaultAudioLinkRange(binding, definition)).toEqual({
      outMax: 4,
      outMin: 0.5,
    })
  })

  test("boolean and unbounded params fall back to the unit range", () => {
    const binding: AnimatedPropertyBinding = {
      key: "toggle",
      kind: "param",
      label: "Toggle",
      valueType: "boolean",
    }

    const booleanDefinition = {
      defaultValue: false,
      key: "toggle",
      label: "Toggle",
      type: "boolean",
    } as unknown as ParameterDefinition

    expect(resolveDefaultAudioLinkRange(binding, booleanDefinition)).toEqual({
      outMax: 1,
      outMin: 0,
    })
    expect(resolveDefaultAudioLinkRange(binding, null)).toEqual({
      outMax: 1,
      outMin: 0,
    })
  })
})
