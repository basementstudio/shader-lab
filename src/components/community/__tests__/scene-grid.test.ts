import { describe, expect, test } from "bun:test"
import {
  FEATURED_MIN_SCENES,
  isFeaturedIndex,
} from "@/components/community/scene-grid"

const base = { query: "", sort: "popular", total: 12 } as const

describe("isFeaturedIndex", () => {
  test("features the top scene on popular", () => {
    expect(isFeaturedIndex(0, base)).toBe(true)
  })

  test("features nothing but the first slot", () => {
    for (const index of [1, 2, 3, 7]) {
      expect(isFeaturedIndex(index, base)).toBe(false)
    }
  })

  test("does not feature on latest, where first means newest and not best", () => {
    expect(isFeaturedIndex(0, { ...base, sort: "latest" })).toBe(false)
  })

  test("does not feature a search result, which is filtered and not ranked", () => {
    expect(isFeaturedIndex(0, { ...base, query: "tokyo" })).toBe(false)
    expect(isFeaturedIndex(0, { ...base, query: "   " })).toBe(true)
  })

  test("does not feature an effect-filtered result", () => {
    expect(isFeaturedIndex(0, { ...base, effects: ["crt"] })).toBe(false)
  })

  test("does not feature until the two hero rows can be filled", () => {
    // a 2x2 tile in a 4-column grid leaves four cells beside it
    for (let total = 0; total < FEATURED_MIN_SCENES; total++) {
      expect(isFeaturedIndex(0, { ...base, total })).toBe(false)
    }

    expect(isFeaturedIndex(0, { ...base, total: FEATURED_MIN_SCENES })).toBe(
      true
    )
  })
})
