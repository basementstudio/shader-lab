import { describe, expect, test } from "bun:test"
import { describeHandleInput, HANDLE_MAX_LENGTH } from "@/lib/community/handle"

function handleOf(raw: unknown): string | null {
  const result = describeHandleInput(raw)

  return "handle" in result ? result.handle : null
}

function reasonOf(raw: unknown): string | null {
  const result = describeHandleInput(raw)

  return "reason" in result ? result.reason : null
}

describe("describeHandleInput", () => {
  test("accepts a plain handle unchanged", () => {
    expect(handleOf("tobi-moccagatta")).toBe("tobi-moccagatta")
  })

  test("normalizes what a person would actually type", () => {
    expect(handleOf("Tobi Moccagatta")).toBe("tobi-moccagatta")
    expect(handleOf("  spaced  ")).toBe("spaced")
    expect(handleOf("Renée Étoile")).toBe("renee-etoile")
    expect(handleOf("a..b__c")).toBe("a-b-c")
  })

  test("tolerates a leading at sign", () => {
    expect(handleOf("@tobi")).toBe("tobi")
    expect(handleOf("@@tobi")).toBe("tobi")
  })

  test("rejects empty and non-string input", () => {
    for (const bad of ["", "   ", "@", null, undefined, 42, {}]) {
      expect(reasonOf(bad)).toBe("Pick a handle.")
    }
  })

  test("rejects punctuation-only input rather than returning empty", () => {
    expect(handleOf("!!!")).toBeNull()
    expect(reasonOf("!!!")).toContain("3 to 30")
  })

  test("rejects input that slugifies to something too short", () => {
    expect(handleOf("ab")).toBeNull()
    expect(handleOf("a")).toBeNull()
    expect(handleOf("@@a")).toBeNull()
  })

  test("counts the dash a separator becomes toward the minimum length", () => {
    expect(handleOf("a b")).toBe("a-b")
  })

  test("rejects raw input far longer than a handle", () => {
    expect(reasonOf("z".repeat(61))).toContain("Keep it under")
  })

  test("truncates a long but legal name instead of rejecting it", () => {
    const handle = handleOf("z".repeat(45))

    expect(handle).not.toBeNull()
    expect((handle as string).length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH)
  })

  test("rejects reserved words, including the profile route prefix", () => {
    for (const reserved of ["admin", "settings", "community", "profile", "u"]) {
      expect(reasonOf(reserved)).toBeTruthy()
      expect(handleOf(reserved)).toBeNull()
    }
  })

  test("never returns a handle with edge dashes", () => {
    for (const raw of ["---hi---", "-abc-", "  -x-  "]) {
      const handle = handleOf(raw)

      if (handle) {
        expect(handle.startsWith("-")).toBe(false)
        expect(handle.endsWith("-")).toBe(false)
      }
    }
  })

  test("is idempotent on its own output", () => {
    for (const raw of ["Tobi Moccagatta", "@Renée Étoile", "a..b__c"]) {
      const once = handleOf(raw)

      expect(once).not.toBeNull()
      expect(handleOf(once)).toBe(once)
    }
  })
})
