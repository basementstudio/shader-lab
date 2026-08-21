import { describe, expect, test } from "bun:test"
import { isCommunityUnread } from "@/lib/community/use-community-unread"

const LATEST = "2026-08-19T12:00:00.000Z"

describe("isCommunityUnread", () => {
  test("nothing published means nothing to see", () => {
    expect(
      isCommunityUnread({ lastSeen: null, latestPublishedAt: null })
    ).toBe(false)
  })

  test("never visited but scenes exist reads as unread", () => {
    expect(
      isCommunityUnread({ lastSeen: null, latestPublishedAt: LATEST })
    ).toBe(true)
  })

  test("a scene published after the last visit is unread", () => {
    expect(
      isCommunityUnread({
        lastSeen: "2026-08-19T11:59:59.000Z",
        latestPublishedAt: LATEST,
      })
    ).toBe(true)
  })

  test("visiting after the newest scene clears it", () => {
    expect(
      isCommunityUnread({
        lastSeen: "2026-08-19T12:00:01.000Z",
        latestPublishedAt: LATEST,
      })
    ).toBe(false)
  })

  test("visiting at the same instant is not unread", () => {
    expect(
      isCommunityUnread({ lastSeen: LATEST, latestPublishedAt: LATEST })
    ).toBe(false)
  })

  test("a corrupt stored value is treated as never visited, not as seen", () => {
    expect(
      isCommunityUnread({ lastSeen: "not a date", latestPublishedAt: LATEST })
    ).toBe(true)
  })

  test("a corrupt published date cannot light the dot forever", () => {
    expect(
      isCommunityUnread({ lastSeen: null, latestPublishedAt: "nonsense" })
    ).toBe(false)
  })
})
