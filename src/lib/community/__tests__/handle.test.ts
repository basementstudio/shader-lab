import { describe, expect, test } from "bun:test"
import {
  buildHandleCandidates,
  deriveHandleSeed,
  HANDLE_MAX_LENGTH,
  isLookupableHandle,
  isReservedHandle,
  isValidHandle,
  slugifyHandle,
} from "@/lib/community/handle"

describe("slugifyHandle", () => {
  test("lowercases and dashes a display name", () => {
    expect(slugifyHandle("Tobi Moccagatta")).toBe("tobi-moccagatta")
  })

  test("strips diacritics rather than dropping the letters", () => {
    expect(slugifyHandle("Renée Étoile")).toBe("renee-etoile")
    expect(slugifyHandle("Añez")).toBe("anez")
  })

  test("collapses punctuation and repeated separators", () => {
    expect(slugifyHandle("a..b__c   d")).toBe("a-b-c-d")
    expect(slugifyHandle("!!!weird!!!name!!!")).toBe("weird-name")
  })

  test("never leaves a leading or trailing dash", () => {
    expect(slugifyHandle("---hi---")).toBe("hi")
    expect(slugifyHandle("  spaced  ")).toBe("spaced")
  })

  test("truncates to the max length without a trailing dash", () => {
    const long = slugifyHandle(`${"ab ".repeat(40)}`)

    expect(long.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH)
    expect(long.endsWith("-")).toBe(false)
  })

  test("returns empty for input with no usable characters", () => {
    expect(slugifyHandle("!!!")).toBe("")
    expect(slugifyHandle("")).toBe("")
  })
})

describe("isValidHandle", () => {
  test("accepts a normal handle", () => {
    expect(isValidHandle("tobi-moccagatta")).toBe(true)
    expect(isValidHandle("abc")).toBe(true)
    expect(isValidHandle("a1b2")).toBe(true)
  })

  test("rejects too short and too long", () => {
    expect(isValidHandle("ab")).toBe(false)
    expect(isValidHandle("a".repeat(HANDLE_MAX_LENGTH + 1))).toBe(false)
  })

  test("rejects edge dashes and uppercase", () => {
    for (const bad of ["-abc", "abc-", "AbC", "a b", "a_b", "a--b".repeat(9)]) {
      expect(isValidHandle(bad)).toBe(false)
    }
  })

  test("rejects reserved handles that would collide with routes", () => {
    for (const reserved of ["admin", "api", "community", "new", "me", "tools"]) {
      expect(isReservedHandle(reserved)).toBe(true)
      expect(isValidHandle(reserved)).toBe(false)
    }
  })

  test("reserves the words the profile routes need", () => {
    for (const reserved of ["account", "drafts", "profile", "profiles", "u"]) {
      expect(isReservedHandle(reserved)).toBe(true)
      expect(isValidHandle(reserved)).toBe(false)
    }
  })
})

describe("isLookupableHandle", () => {
  test("agrees with isValidHandle on shape", () => {
    for (const good of ["tobi-moccagatta", "abc", "a1b2"]) {
      expect(isLookupableHandle(good)).toBe(true)
    }

    for (const bad of ["ab", "-abc", "abc-", "AbC", "a b", "a_b", ""]) {
      expect(isLookupableHandle(bad)).toBe(false)
    }

    expect(isLookupableHandle("a".repeat(HANDLE_MAX_LENGTH + 1))).toBe(false)
  })

  test("still resolves a handle that has since become reserved", () => {
    for (const reserved of ["account", "drafts", "profile", "settings"]) {
      expect(isValidHandle(reserved)).toBe(false)
      expect(isLookupableHandle(reserved)).toBe(true)
    }
  })

  test("is too short to match the profile route prefix", () => {
    expect(isLookupableHandle("u")).toBe(false)
  })
})

describe("deriveHandleSeed", () => {
  test("prefers the display name", () => {
    expect(
      deriveHandleSeed({ email: "zzz@example.com", name: "Tobi Moccagatta" })
    ).toBe("tobi-moccagatta")
  })

  test("falls back to the email local part when the name is unusable", () => {
    expect(deriveHandleSeed({ email: "shaderfan@example.com", name: "!!" })).toBe(
      "shaderfan"
    )
    expect(deriveHandleSeed({ email: "shaderfan@example.com", name: null })).toBe(
      "shaderfan"
    )
  })

  test("falls back to a constant when nothing is usable", () => {
    expect(deriveHandleSeed({ email: null, name: null })).toBe("maker")
    expect(deriveHandleSeed({ email: "a@b.com", name: "" })).toBe("maker")
  })
})

describe("buildHandleCandidates", () => {
  test("offers the seed first, then numbered variants", () => {
    const candidates = buildHandleCandidates({ name: "Tobi Moccagatta" })

    expect(candidates[0]).toBe("tobi-moccagatta")
    expect(candidates[1]).toBe("tobi-moccagatta-2")
    expect(candidates[2]).toBe("tobi-moccagatta-3")
  })

  test("every candidate is valid and unique", () => {
    const candidates = buildHandleCandidates({ name: "Tobi Moccagatta" })

    expect(candidates.length).toBeGreaterThan(1)
    expect(new Set(candidates).size).toBe(candidates.length)

    for (const candidate of candidates) {
      expect(isValidHandle(candidate)).toBe(true)
    }
  })

  test("suffixed candidates still respect the max length", () => {
    const candidates = buildHandleCandidates({ name: "z".repeat(60) })

    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH)
      expect(isValidHandle(candidate)).toBe(true)
    }
  })

  test("a reserved seed still yields usable candidates", () => {
    const candidates = buildHandleCandidates({ name: "Admin" })

    expect(candidates).not.toContain("admin")
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0]).toBe("admin-2")
  })
})
