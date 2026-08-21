import { describe, expect, test } from "bun:test"
import {
  CURATED_SCENE_TAG_LABELS,
  CURATED_SCENE_TAGS,
  getSceneTagLabel,
  isCuratedSceneTag,
} from "@/lib/community/scene-tags"
import { LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"

describe("curated scene tags", () => {
  test("uses unique kebab-case slugs with labels", () => {
    expect(new Set(CURATED_SCENE_TAGS).size).toBe(CURATED_SCENE_TAGS.length)

    for (const tag of CURATED_SCENE_TAGS) {
      expect(tag).toMatch(/^[a-z]+(?:-[a-z]+)*$/)
      expect(CURATED_SCENE_TAG_LABELS[tag].length).toBeGreaterThan(0)
    }
  })

  test("recognizes every curated slug and rejects other values", () => {
    for (const tag of CURATED_SCENE_TAGS) {
      expect(isCuratedSceneTag(tag)).toBe(true)
      expect(isCuratedSceneTag(tag.toUpperCase())).toBe(false)
    }

    for (const value of [null, undefined, 7, {}, "unknown-tag"]) {
      expect(isCuratedSceneTag(value)).toBe(false)
    }
  })

  test("falls back to a raw slug when a legacy tag has no label", () => {
    expect(getSceneTagLabel("future-tag")).toBe("future-tag")
  })

  test("does not duplicate an auto-derived layer type", () => {
    const layerTypes = new Set(Object.keys(LAYER_CATALOG))

    for (const tag of CURATED_SCENE_TAGS) {
      expect(layerTypes.has(tag)).toBe(false)
    }
  })
})
