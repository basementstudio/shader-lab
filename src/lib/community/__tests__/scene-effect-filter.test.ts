import { describe, expect, test } from "bun:test"
import {
  COMMUNITY_EFFECT_TYPES,
  getCommunitySceneEffects,
  isCommunityEffectType,
} from "@/lib/community/scene-effect-filter"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { EFFECT_LAYER_TYPES } from "@/types/editor"

describe("community effect filters", () => {
  test("offers every effect type exactly once in label order", () => {
    expect(new Set(COMMUNITY_EFFECT_TYPES).size).toBe(
      COMMUNITY_EFFECT_TYPES.length
    )
    expect(new Set(COMMUNITY_EFFECT_TYPES)).toEqual(new Set(EFFECT_LAYER_TYPES))
    expect(COMMUNITY_EFFECT_TYPES.map(getLayerLabel)).toEqual(
      COMMUNITY_EFFECT_TYPES.map(getLayerLabel).toSorted((left, right) =>
        left.localeCompare(right)
      )
    )
  })

  test("accepts effects and rejects source, model, and editorial tags", () => {
    for (const effect of COMMUNITY_EFFECT_TYPES) {
      expect(isCommunityEffectType(effect)).toBe(true)
    }

    for (const value of [
      null,
      undefined,
      7,
      "CRT",
      "sci-fi",
      "image",
      "text",
      "model",
      "unknown",
    ]) {
      expect(isCommunityEffectType(value)).toBe(false)
    }
  })

  test("derives every effect tag from a mixed scene stack", () => {
    expect(
      getCommunitySceneEffects(["image", "crt", "dithering", "text"])
    ).toEqual(["crt", "dithering"])
  })
})
