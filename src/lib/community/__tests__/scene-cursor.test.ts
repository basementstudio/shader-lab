import { describe, expect, test } from "bun:test"
import {
  decodeSceneCursor,
  encodeSceneCursor,
} from "@/lib/community/scene-cursor"

const cursor = {
  id: "scn_abc123",
  likeCount: 7,
  publishedAt: "2026-08-13T18:28:16.575Z",
}

describe("scene cursor", () => {
  test("round-trips every field", () => {
    expect(decodeSceneCursor(encodeSceneCursor(cursor))).toEqual(cursor)
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

  test("rejects anything it did not produce, rather than trusting it", () => {
    for (const value of [
      "not-base64!!",
      btoa("{}"),
      btoa("[]"),
      btoa('["2026-08-13T18:28:16.575Z"]'),
      btoa('["2026-08-13T18:28:16.575Z", 7]'),
      btoa('["2026-08-13T18:28:16.575Z", 7, "id", "extra"]'),
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
})
