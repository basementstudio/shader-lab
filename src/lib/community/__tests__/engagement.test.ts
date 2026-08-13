import { describe, expect, test } from "bun:test"
import { dayBucketFor, resolveActorKey } from "@/lib/community/engagement"

describe("dayBucketFor", () => {
  test("buckets by UTC calendar day", () => {
    expect(dayBucketFor(new Date("2026-08-13T00:00:00Z"))).toBe("2026-08-13")
    expect(dayBucketFor(new Date("2026-08-13T23:59:59Z"))).toBe("2026-08-13")
  })

  test("rolls over at UTC midnight, not local midnight", () => {
    expect(dayBucketFor(new Date("2026-08-14T00:00:01Z"))).toBe("2026-08-14")
  })
})

describe("resolveActorKey", () => {
  test("a signed-in user is keyed by user id", () => {
    expect(resolveActorKey({ anonId: null, userId: "abc" })).toBe("user:abc")
  })

  test("the session wins over anything the client claims", () => {
    expect(resolveActorKey({ anonId: "aaaaaaaaaaaa", userId: "abc" })).toBe(
      "user:abc"
    )
  })

  test("a well-formed anonymous id is namespaced apart from users", () => {
    expect(resolveActorKey({ anonId: "abcdefgh1234", userId: null })).toBe(
      "anon:abcdefgh1234"
    )
  })

  test("a uuid from crypto.randomUUID is accepted", () => {
    expect(
      resolveActorKey({
        anonId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        userId: null,
      })
    ).toBe("anon:3f2504e0-4f89-11d3-9a0c-0305e82c3301")
  })

  test("rejects anonymous ids that are too short or too long", () => {
    expect(resolveActorKey({ anonId: "short", userId: null })).toBeNull()
    expect(resolveActorKey({ anonId: "a".repeat(41), userId: null })).toBeNull()
  })

  test("rejects anything that is not a plain token", () => {
    for (const anonId of [
      "has spaces",
      "has:colon",
      "has/slash",
      "user:pretend",
      "",
      null,
      undefined,
      42,
      { id: "x" },
    ]) {
      expect(resolveActorKey({ anonId, userId: null })).toBeNull()
    }
  })
})
