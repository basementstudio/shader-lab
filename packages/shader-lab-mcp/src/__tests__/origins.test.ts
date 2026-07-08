import { describe, expect, test } from "bun:test"
import { isOriginAllowed } from "../lib/bridge"

describe("isOriginAllowed", () => {
  test("always allows localhost origins", () => {
    expect(isOriginAllowed("http://localhost:3000", [])).toBe(true)
    expect(isOriginAllowed("http://127.0.0.1:3001", [])).toBe(true)
    expect(isOriginAllowed("https://localhost", [])).toBe(true)
  })

  test("refuses non-local origins by default", () => {
    expect(isOriginAllowed("https://evil.example.com", [])).toBe(false)
    expect(isOriginAllowed("https://shader-lab.vercel.app", [])).toBe(false)
  })

  test("allows exact extra origins", () => {
    const extra = ["https://shader-lab.vercel.app"]

    expect(isOriginAllowed("https://shader-lab.vercel.app", extra)).toBe(true)
    expect(isOriginAllowed("https://other.vercel.app", extra)).toBe(false)
  })

  test("allows wildcard subdomain origins", () => {
    const extra = ["https://*.vercel.app"]

    expect(
      isOriginAllowed("https://shader-lab-git-plan-009.vercel.app", extra)
    ).toBe(true)
    expect(isOriginAllowed("http://shader-lab.vercel.app", extra)).toBe(false)
    expect(isOriginAllowed("https://vercel.app.evil.com", extra)).toBe(false)
  })

  test("ignores malformed wildcard entries", () => {
    expect(isOriginAllowed("https://a.b.com", ["*", "https://*", "junk"])).toBe(
      false
    )
  })
})
