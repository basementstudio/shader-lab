import { describe, expect, test } from "bun:test"
import { mergeScenePages } from "@/lib/community/merge-scenes"
import type { CommunitySceneSummary } from "@/lib/community/scenes"

function scene(slug: string, likeCount = 0): CommunitySceneSummary {
  return { likeCount, slug } as CommunitySceneSummary
}

describe("mergeScenePages", () => {
  test("appends a following page in order", () => {
    const merged = mergeScenePages(
      [scene("a"), scene("b")],
      [scene("c"), scene("d")]
    )

    expect(merged.map((s) => s.slug)).toEqual(["a", "b", "c", "d"])
  })

  test("drops a scene that already arrived, which is what a shifting sort causes", () => {
    const merged = mergeScenePages(
      [scene("a"), scene("b")],
      [scene("b"), scene("c")]
    )

    expect(merged.map((s) => s.slug)).toEqual(["a", "b", "c"])
  })

  test("keeps the copy already held, so an optimistic count is not overwritten", () => {
    const merged = mergeScenePages([scene("a", 5)], [scene("a", 0)])

    expect(merged).toHaveLength(1)
    expect(merged[0]?.likeCount).toBe(5)
  })

  test("dedupes within the incoming page too", () => {
    const merged = mergeScenePages([], [scene("a"), scene("a"), scene("b")])

    expect(merged.map((s) => s.slug)).toEqual(["a", "b"])
  })

  test("returns the same array when there is nothing to add, so React can skip a render", () => {
    const current = [scene("a")]

    expect(mergeScenePages(current, [])).toBe(current)
    expect(mergeScenePages(current, [scene("a")])).toBe(current)
  })

  test("handles an empty starting list", () => {
    expect(mergeScenePages([], [scene("a")]).map((s) => s.slug)).toEqual(["a"])
  })
})
