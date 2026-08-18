import { describe, expect, test } from "bun:test"
import {
  describeDraftContents,
  describeSavedAt,
} from "@/components/community/draft-card"
import type { DraftSummary } from "@/lib/community/scenes"

const NOW = Date.parse("2026-08-18T12:00:00.000Z")

function at(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString()
}

function draft(overrides?: Partial<DraftSummary>): DraftSummary {
  return {
    compositionHeight: 1080,
    compositionWidth: 1920,
    durationSeconds: 6,
    id: "scn_aaaaaaaaaaaaaaaa",
    labUrl: "https://cdn.test/scenes/x/draft.lab.json",
    layerTypes: [],
    thumbnailUrl: null,
    title: "Untitled draft",
    updatedAt: at(0),
    ...overrides,
  } as DraftSummary
}

describe("describeSavedAt", () => {
  test("anything under a minute reads as just now", () => {
    expect(describeSavedAt(at(0), NOW)).toBe("Saved just now")
    expect(describeSavedAt(at(59_000), NOW)).toBe("Saved just now")
  })

  test("singular and plural minutes", () => {
    expect(describeSavedAt(at(60_000), NOW)).toBe("Saved 1 minute ago")
    expect(describeSavedAt(at(4 * 60_000), NOW)).toBe("Saved 4 minutes ago")
  })

  test("rolls up to hours and days, largest unit first", () => {
    expect(describeSavedAt(at(3_600_000), NOW)).toBe("Saved 1 hour ago")
    expect(describeSavedAt(at(5 * 3_600_000), NOW)).toBe("Saved 5 hours ago")
    expect(describeSavedAt(at(86_400_000), NOW)).toBe("Saved 1 day ago")
    expect(describeSavedAt(at(9 * 86_400_000), NOW)).toBe("Saved 9 days ago")
  })

  test("a clock skewed into the future does not read as negative", () => {
    expect(describeSavedAt(at(-90_000), NOW)).toBe("Saved just now")
  })

  test("an unparseable timestamp does not render NaN", () => {
    expect(describeSavedAt("not a date", NOW)).toBe("Saved just now")
  })
})

describe("describeDraftContents", () => {
  test("names the layers a draft holds", () => {
    expect(
      describeDraftContents(draft({ layerTypes: ["gradient", "crt"] }))
    ).toBe("gradient, crt")
  })

  test("caps the list so a long stack does not overflow the tile", () => {
    expect(
      describeDraftContents(
        draft({ layerTypes: ["a", "b", "c", "d", "e"] as never })
      )
    ).toBe("a, b, c")
  })

  test("an empty draft says so rather than rendering nothing", () => {
    expect(describeDraftContents(draft())).toBe("Empty scene")
  })
})
