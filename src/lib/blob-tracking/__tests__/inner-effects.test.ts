import { describe, expect, test } from "bun:test"
import {
  INNER_EFFECT_NONE,
  INNER_EFFECT_TYPES,
  isInnerEffectType,
  parseInnerEffectParams,
  serializeInnerEffectParams,
} from "@/lib/blob-tracking/inner-effects"

describe("inner-effect set", () => {
  test("excludes blur (no pass implementation)", () => {
    expect(INNER_EFFECT_TYPES).not.toContain("blur")
  })

  test("excludes blob-tracking itself (no recursive children)", () => {
    expect(INNER_EFFECT_TYPES).not.toContain("blob-tracking")
  })

  test("includes a representative pass-backed effect", () => {
    expect(INNER_EFFECT_TYPES).toContain("posterize")
  })

  test("recognizes valid inner effect types including none", () => {
    expect(isInnerEffectType(INNER_EFFECT_NONE)).toBe(true)
    expect(isInnerEffectType("posterize")).toBe(true)
    expect(isInnerEffectType("blur")).toBe(false)
    expect(isInnerEffectType("nonsense")).toBe(false)
    expect(isInnerEffectType(42)).toBe(false)
  })
})

describe("parseInnerEffectParams", () => {
  test("none yields no parameters", () => {
    expect(parseInnerEffectParams(INNER_EFFECT_NONE, "{}")).toEqual({})
  })

  test("fills defaults and applies a valid override (round-trip)", () => {
    const serialized = serializeInnerEffectParams({
      gamma: 1,
      levels: 8,
      mode: "luma",
    })
    const parsed = parseInnerEffectParams("posterize", serialized)

    expect(parsed).toEqual({ gamma: 1, levels: 8, mode: "luma" })
  })

  test("bad JSON falls back to defaults", () => {
    const parsed = parseInnerEffectParams("posterize", "not json {")

    // posterize defaults from the registry
    expect(parsed).toEqual({ gamma: 1, levels: 5, mode: "rgb" })
  })

  test("drops unknown keys", () => {
    const parsed = parseInnerEffectParams(
      "posterize",
      JSON.stringify({ bogus: 123, levels: 12 })
    )

    expect(parsed.levels).toBe(12)
    expect(parsed).not.toHaveProperty("bogus")
  })

  test("ignores values whose type does not match the definition", () => {
    const parsed = parseInnerEffectParams(
      "posterize",
      JSON.stringify({ levels: "eight", mode: "luma" })
    )

    // levels stays at its numeric default; mode override is applied
    expect(parsed.levels).toBe(5)
    expect(parsed.mode).toBe("luma")
  })

  test("rejects an unknown inner effect type", () => {
    expect(() =>
      parseInnerEffectParams("blur" as never, "{}")
    ).toThrow("Unknown inner effect type: blur")
  })
})
