import { describe, expect, test } from "bun:test"
import {
  COMMUNITY_LAYER_FILTER_OPTIONS,
  COMMUNITY_LAYER_TYPES,
  isCommunityLayerType,
} from "@/lib/community/scene-layer-filter"
import { getLayerLabel, LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"

describe("community layer filters", () => {
  test("offers every layer type exactly once in label order", () => {
    expect(new Set(COMMUNITY_LAYER_TYPES).size).toBe(
      COMMUNITY_LAYER_TYPES.length
    )
    expect(new Set(COMMUNITY_LAYER_TYPES)).toEqual(
      new Set(Object.keys(LAYER_CATALOG))
    )
    expect(COMMUNITY_LAYER_TYPES.map(getLayerLabel)).toEqual(
      COMMUNITY_LAYER_TYPES.map(getLayerLabel).toSorted((left, right) =>
        left.localeCompare(right)
      )
    )
  })

  test("starts with an unfiltered option and labels each layer", () => {
    expect(COMMUNITY_LAYER_FILTER_OPTIONS[0]?.label).toBe("All layers")

    for (const layer of COMMUNITY_LAYER_TYPES) {
      expect(
        COMMUNITY_LAYER_FILTER_OPTIONS.some(
          (option) =>
            option.value === layer && option.label === getLayerLabel(layer)
        )
      ).toBe(true)
    }
  })

  test("validates URL values against the actual layer catalog", () => {
    for (const layer of COMMUNITY_LAYER_TYPES) {
      expect(isCommunityLayerType(layer)).toBe(true)
    }

    for (const value of [null, undefined, 7, "CRT", "sci-fi", "unknown"]) {
      expect(isCommunityLayerType(value)).toBe(false)
    }
  })
})
