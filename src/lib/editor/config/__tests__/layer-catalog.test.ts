import { describe, expect, test } from "bun:test"
import {
  getLayerCatalogEntry,
  getLayerLabel,
  LAYER_CATALOG,
  LAYER_CATALOG_CATEGORIES,
} from "@/lib/editor/config/layer-catalog"
import type { LayerType } from "@/types/editor"
import {
  EFFECT_LAYER_TYPES,
  MODEL_LAYER_TYPES,
  SOURCE_LAYER_TYPES,
} from "@/types/editor"

const ALL_LAYER_TYPES: readonly LayerType[] = [
  ...SOURCE_LAYER_TYPES,
  ...EFFECT_LAYER_TYPES,
  ...MODEL_LAYER_TYPES,
]

describe("LAYER_CATALOG", () => {
  test("covers every layer type exactly once", () => {
    expect(Object.keys(LAYER_CATALOG).sort()).toEqual(
      [...ALL_LAYER_TYPES].sort()
    )
  })

  test("every entry has a non-empty label", () => {
    for (const type of ALL_LAYER_TYPES) {
      expect(getLayerCatalogEntry(type).label.trim().length).toBeGreaterThan(0)
    }
  })

  test("labels are unique so scene chips are unambiguous", () => {
    const labels = ALL_LAYER_TYPES.map((type) => getLayerLabel(type))

    expect(new Set(labels).size).toBe(labels.length)
  })

  test("only effect types carry a picker category", () => {
    for (const type of [...SOURCE_LAYER_TYPES, ...MODEL_LAYER_TYPES]) {
      expect(LAYER_CATALOG[type].category).toBeUndefined()
    }

    for (const type of ALL_LAYER_TYPES) {
      const { category } = LAYER_CATALOG[type]

      if (category) {
        expect(EFFECT_LAYER_TYPES).toContain(type)
        expect(LAYER_CATALOG_CATEGORIES).toContain(category)
      }
    }
  })

  test("a description always comes with a category", () => {
    for (const type of ALL_LAYER_TYPES) {
      const entry = LAYER_CATALOG[type]

      if (entry.description) {
        expect(entry.category).toBeDefined()
      }
    }
  })

  test("every previewSrc points at a file that exists in public/", async () => {
    const missing: string[] = []

    for (const type of ALL_LAYER_TYPES) {
      const { previewSrc } = LAYER_CATALOG[type]

      if (!previewSrc) {
        continue
      }

      expect(previewSrc.startsWith("/")).toBe(true)

      if (!(await Bun.file(`public${previewSrc}`).exists())) {
        missing.push(`${type} -> ${previewSrc}`)
      }
    }

    expect(missing).toEqual([])
  })

  test("getLayerLabel falls back to the raw type for an unknown layer", () => {
    expect(getLayerLabel("not-a-layer" as LayerType)).toBe("not-a-layer")
  })
})
