import { describe, expect, test } from "bun:test"
import {
  decodeSceneCursor,
  encodeSceneCursor,
} from "@/lib/community/scene-cursor"

const cursor = {
  featuredAt: null,
  id: "scn_abc123",
  likeCount: 7,
  publishedAt: "2026-08-13T18:28:16.575Z",
}

describe("scene cursor", () => {
  test("round-trips every field", () => {
    expect(decodeSceneCursor(encodeSceneCursor(cursor))).toEqual(cursor)
  })

  test("round-trips a featured timestamp", () => {
    const featured = { ...cursor, featuredAt: "2026-08-10T09:00:00.000Z" }

    expect(decodeSceneCursor(encodeSceneCursor(featured))).toEqual(featured)
  })

  test("survives a zero like count", () => {
    const zero = { ...cursor, likeCount: 0 }

    expect(decodeSceneCursor(encodeSceneCursor(zero))).toEqual(zero)
  })

  test("encodes to a url-safe token", () => {
    const encoded = encodeSceneCursor(cursor)

    expect(encoded).not.toMatch(/[+/=]/)
    expect(encodeURIComponent(encoded)).toBe(encoded)
  })

  test("treats a missing cursor as the first page", () => {
    expect(decodeSceneCursor(null)).toBeNull()
    expect(decodeSceneCursor("")).toBeNull()
  })

  test("still reads a cursor issued before featuredAt was carried", () => {
    expect(
      decodeSceneCursor(btoa('["2026-08-13T18:28:16.575Z", 7, "scn_abc123"]'))
    ).toEqual(cursor)
  })

  test("rejects anything it did not produce, rather than trusting it", () => {
    for (const value of [
      "not-base64!!",
      btoa("{}"),
      btoa("[]"),
      btoa('["2026-08-13T18:28:16.575Z"]'),
      btoa('["2026-08-13T18:28:16.575Z", 7]'),
      btoa('["2026-08-13T18:28:16.575Z", 7, "id", "extra"]'),
      btoa('["2026-08-13T18:28:16.575Z", 7, "id", "extra", "more"]'),
      btoa('["not-a-date", 7, "id"]'),
      btoa('["2026-08-13T18:28:16.575Z", "seven", "id"]'),
      btoa('["2026-08-13T18:28:16.575Z", 7, ""]'),
      btoa('{"publishedAt":"2026-08-13T18:28:16.575Z"}'),
    ]) {
      expect(decodeSceneCursor(value)).toBeNull()
    }
  })

  test("rejects a non-finite like count", () => {
    expect(
      decodeSceneCursor(btoa('["2026-08-13T18:28:16.575Z", null, "id"]'))
    ).toBeNull()
  })

  test("rejects a like count postgres could not bind as an int", () => {
    for (const likeCount of ["1.5", "-1", "1e19", "2147483648", "1e999"]) {
      expect(
        decodeSceneCursor(
          btoa(`["2026-08-13T18:28:16.575Z", ${likeCount}, "id"]`)
        )
      ).toBeNull()
    }
  })

  test("keeps the largest like count postgres can still bind", () => {
    expect(
      decodeSceneCursor(btoa('["2026-08-13T18:28:16.575Z", 2147483647, "id"]'))
        ?.likeCount
    ).toBe(2_147_483_647)
  })

  test("rejects a featuredAt that is not a timestamp", () => {
    for (const featuredAt of ["7", "true", '"not-a-date"', "{}"]) {
      expect(
        decodeSceneCursor(
          btoa(`["2026-08-13T18:28:16.575Z", 7, "id", ${featuredAt}]`)
        )
      ).toBeNull()
    }
  })
})
