import { describe, expect, test } from "bun:test"
import {
  isUniqueViolation,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
} from "@/lib/community/profile"

function pgError(code: string) {
  return Object.assign(new Error("insert failed"), { code })
}

function wrap(cause: unknown, message = "Failed query: insert into profiles") {
  return Object.assign(new Error(message), { cause })
}

describe("isUniqueViolation", () => {
  test("detects a bare driver error", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true)
  })

  test("detects it through Drizzle's wrapper, where code is on the cause", () => {
    expect(isUniqueViolation(wrap(pgError("23505")))).toBe(true)
  })

  test("walks more than one level of cause", () => {
    expect(isUniqueViolation(wrap(wrap(pgError("23505"))))).toBe(true)
  })

  test("falls back to the message when no code is present", () => {
    expect(
      isUniqueViolation(
        new Error('duplicate key value violates unique constraint "x"')
      )
    ).toBe(true)
  })

  test("does not treat other postgres errors as collisions", () => {
    for (const code of ["23503", "23502", "42P01", "40001"]) {
      expect(isUniqueViolation(pgError(code))).toBe(false)
      expect(isUniqueViolation(wrap(pgError(code)))).toBe(false)
    }
  })

  test("is safe on non-errors and empty values", () => {
    for (const value of [null, undefined, "", 0, {}, new Error("boom")]) {
      expect(isUniqueViolation(value)).toBe(false)
    }
  })

  test("terminates on a self-referencing cause chain", () => {
    const looped: { cause?: unknown; code?: string } = {}
    looped.cause = looped

    expect(isUniqueViolation(looped)).toBe(false)
  })
})

describe("normalizeDisplayName", () => {
  test("masks a slur an identity provider handed us", () => {
    expect(normalizeDisplayName("Fuck Face")).toBe("**** Face")
  })

  test("trims and caps a name that arrives unbounded", () => {
    expect(normalizeDisplayName(`  ${"n".repeat(400)}  `)).toHaveLength(
      MAX_DISPLAY_NAME_LENGTH
    )
  })

  test("returns null for anything that is not a usable name", () => {
    for (const value of ["", "   ", null, undefined, 42, {}]) {
      expect(normalizeDisplayName(value)).toBeNull()
    }
  })

  test("leaves an ordinary name alone", () => {
    expect(normalizeDisplayName("Tobi Moccagatta")).toBe("Tobi Moccagatta")
  })
})
