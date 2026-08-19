import { describe, expect, test } from "bun:test"
import { countLabel, pluralize } from "@/lib/plural"

describe("countLabel", () => {
  test("one is singular", () => {
    expect(countLabel(1, "remix")).toBe("1 remix")
    expect(countLabel(1, "upvote")).toBe("1 upvote")
  })

  test("zero is plural, which is what English does", () => {
    expect(countLabel(0, "remix")).toBe("0 remixes")
    expect(countLabel(0, "scene")).toBe("0 scenes")
  })

  test("many is plural", () => {
    expect(countLabel(40, "remix")).toBe("40 remixes")
  })

  test("takes an irregular plural when adding s would be wrong", () => {
    expect(countLabel(2, "remix", "remixes")).toBe("2 remixes")
    expect(countLabel(1, "remix", "remixes")).toBe("1 remix")
  })
})

describe("countLabel default plural", () => {
  test("a sibilant ending takes es, not s", () => {
    expect(countLabel(2, "remix")).toBe("2 remixes")
    expect(countLabel(2, "class")).toBe("2 classes")
    expect(countLabel(2, "brush")).toBe("2 brushes")
    expect(countLabel(2, "match")).toBe("2 matches")
  })

  test("an ordinary word still takes s", () => {
    expect(countLabel(2, "scene")).toBe("2 scenes")
    expect(countLabel(2, "upvote")).toBe("2 upvotes")
    expect(countLabel(2, "layer")).toBe("2 layers")
  })

  test("an explicit plural still wins for anything irregular", () => {
    expect(countLabel(2, "person", "people")).toBe("2 people")
  })
})

describe("pluralize", () => {
  test("returns the noun alone, so a caller can lay out the number itself", () => {
    expect(pluralize(1, "scene")).toBe("scene")
    expect(pluralize(0, "scene")).toBe("scenes")
    expect(pluralize(1, "remix")).toBe("remix")
    expect(pluralize(3, "remix")).toBe("remixes")
  })
})
