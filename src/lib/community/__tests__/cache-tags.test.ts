import { describe, expect, test } from "bun:test"
import {
  authorTag,
  COMMUNITY_FEED_TAG,
  profileHandleTag,
  sceneTag,
} from "@/lib/community/cache-tags"

describe("cache tags", () => {
  test("keeps the exact strings the revalidate calls depend on", () => {
    expect(COMMUNITY_FEED_TAG).toBe("community-feed")
    expect(authorTag("6c1f0a2e")).toBe("author:6c1f0a2e")
    expect(profileHandleTag("tobi-moccagatta")).toBe(
      "profile-handle:tobi-moccagatta"
    )
    expect(sceneTag("basement-vme0ud")).toBe("scene:basement-vme0ud")
  })

  test("never collides across tag families for the same value", () => {
    const value = "overlap"
    const tags = [authorTag(value), profileHandleTag(value), sceneTag(value)]

    expect(new Set(tags).size).toBe(tags.length)
    expect(tags).not.toContain(COMMUNITY_FEED_TAG)
  })

  test("distinguishes two handles that differ only by suffix", () => {
    expect(profileHandleTag("tobi")).not.toBe(profileHandleTag("tobi-2"))
  })
})
