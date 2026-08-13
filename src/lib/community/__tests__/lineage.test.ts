import { describe, expect, test } from "bun:test"
import { lineageAuthorName, lineageLabel } from "@/lib/community/lineage"
import type { SceneLineage } from "@/lib/community/scenes"

function lineage(overrides: Partial<SceneLineage> = {}): SceneLineage {
  return {
    authorAvatarUrl: null,
    authorHandle: "bautista-berto",
    authorName: "Bautista Berto",
    slug: "5am-tokyo-run-q1zxkc",
    title: "5AM Tokyo run",
    ...overrides,
  }
}

describe("lineageAuthorName", () => {
  test("credits the display name when the author has one", () => {
    expect(lineageAuthorName(lineage())).toBe("Bautista Berto")
  })

  test("falls back to the handle so a remix is never uncredited", () => {
    expect(lineageAuthorName(lineage({ authorName: null }))).toBe(
      "@bautista-berto"
    )
  })
})

describe("lineageLabel", () => {
  test("names both the author and the scene, since the link only shows the author", () => {
    expect(lineageLabel(lineage())).toBe(
      "Remixed from Bautista Berto: 5AM Tokyo run"
    )
  })

  test("uses the handle fallback too", () => {
    expect(lineageLabel(lineage({ authorName: null }))).toBe(
      "Remixed from @bautista-berto: 5AM Tokyo run"
    )
  })
})
