import { describe, expect, test } from "bun:test"
import { PgDialect } from "drizzle-orm/pg-core"
import {
  dayBucketFor,
  likeCountFromRows,
  readPlatformClientIp,
  resolveActorKey,
} from "@/lib/community/engagement"

const WHEN = new Date("2026-08-13T12:00:00Z")

function anonKeyFor(clientIp: string | null, when = WHEN): string {
  return resolveActorKey({ clientIp, userId: null, when })
}

describe("dayBucketFor", () => {
  test("buckets by UTC calendar day", () => {
    expect(dayBucketFor(new Date("2026-08-13T00:00:00Z"))).toBe("2026-08-13")
    expect(dayBucketFor(new Date("2026-08-13T23:59:59Z"))).toBe("2026-08-13")
  })

  test("rolls over at UTC midnight, not local midnight", () => {
    expect(dayBucketFor(new Date("2026-08-14T00:00:01Z"))).toBe("2026-08-14")
  })
})

describe("readPlatformClientIp", () => {
  test("prefers the header the platform namespaces to itself", () => {
    const headers = new Headers({
      "x-forwarded-for": "9.9.9.9",
      "x-real-ip": "8.8.8.8",
      "x-vercel-forwarded-for": "203.0.113.7",
    })

    expect(readPlatformClientIp(headers)).toBe("203.0.113.7")
  })

  test("falls back through the remaining platform headers", () => {
    expect(readPlatformClientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe(
      "8.8.8.8"
    )
    expect(
      readPlatformClientIp(new Headers({ "x-forwarded-for": "9.9.9.9" }))
    ).toBe("9.9.9.9")
  })

  test("takes the client end of a forwarded chain", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    })

    expect(readPlatformClientIp(headers)).toBe("203.0.113.7")
  })

  test("ignores headers no proxy in front of this app sets", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "client-ip": "203.0.113.7",
      "true-client-ip": "203.0.113.7",
    })

    expect(readPlatformClientIp(headers)).toBeNull()
  })

  test("treats an empty or blank header as absent", () => {
    expect(readPlatformClientIp(new Headers())).toBeNull()
    expect(
      readPlatformClientIp(new Headers({ "x-forwarded-for": " , 9.9.9.9" }))
    ).toBe("9.9.9.9")
  })
})

describe("resolveActorKey", () => {
  test("a signed-in user is keyed by user id", () => {
    expect(resolveActorKey({ clientIp: null, userId: "abc", when: WHEN })).toBe(
      "user:abc"
    )
  })

  test("the session wins over the request ip", () => {
    expect(
      resolveActorKey({ clientIp: "203.0.113.7", userId: "abc", when: WHEN })
    ).toBe("user:abc")
  })

  test("an anonymous actor is namespaced apart from users", () => {
    expect(anonKeyFor("203.0.113.7")).toMatch(/^anon:/)
  })

  test("the same ip on the same day dedups to one actor", () => {
    expect(anonKeyFor("203.0.113.7")).toBe(anonKeyFor("203.0.113.7"))
  })

  test("a different ip is a different actor", () => {
    expect(anonKeyFor("203.0.113.7")).not.toBe(anonKeyFor("203.0.113.8"))
  })

  test("the same ip on the next day is a fresh actor", () => {
    expect(anonKeyFor("203.0.113.7")).not.toBe(
      anonKeyFor("203.0.113.7", new Date("2026-08-14T12:00:00Z"))
    )
  })

  test("never stores the raw ip", () => {
    expect(anonKeyFor("203.0.113.7")).not.toContain("203.0.113.7")
  })

  test("a missing ip still yields a usable actor, so anonymous remixing works", () => {
    expect(anonKeyFor(null)).toMatch(/^anon:/)
    expect(anonKeyFor(null)).toBe(anonKeyFor(null))
    expect(anonKeyFor(null)).not.toBe(anonKeyFor("203.0.113.7"))
  })

  test("nothing in the request body can steer the anonymous key", () => {
    const claimingAnonId = {
      anonId: "aaaaaaaaaaaa",
      clientIp: "203.0.113.7",
      userId: null,
      when: WHEN,
    }
    const claimingAnotherAnonId = { ...claimingAnonId, anonId: "bbbbbbbbbbbb" }

    expect(resolveActorKey(claimingAnonId)).toBe(anonKeyFor("203.0.113.7"))
    expect(resolveActorKey(claimingAnotherAnonId)).toBe(
      resolveActorKey(claimingAnonId)
    )
  })
})

describe("likeCountFromRows", () => {
  test("counts the like rows instead of adjusting the stored total", () => {
    const { params, sql } = new PgDialect().sqlToQuery(
      likeCountFromRows("scn_abc")
    )

    expect(sql).toContain("select count(*)")
    expect(sql).toContain('"likes"."scene_id"')
    expect(params).toEqual(["scn_abc"])
  })

  test("never leans on the previous value, so a drifted count self-heals", () => {
    const { sql } = new PgDialect().sqlToQuery(likeCountFromRows("scn_abc"))

    expect(sql).not.toContain("like_count")
    expect(sql).not.toContain("greatest")
  })
})
