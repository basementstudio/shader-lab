import { afterEach, describe, expect, test } from "bun:test"
import { isModerator } from "@/lib/community/moderation"
import { deleteScenePrefix } from "@/lib/community/r2"
import { isReportReason, REPORT_REASONS } from "@/lib/community/report-reasons"

const saved = new Map<string, string | undefined>()

function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) {
    saved.set(key, process.env[key])
  }

  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  saved.clear()
})

function sessionWith(email: string | null) {
  return { user: { email, id: "user-1", image: null, name: null } }
}

describe("isModerator", () => {
  test("nobody moderates when no allowlist is configured", () => {
    setEnv("COMMUNITY_ADMIN_EMAILS", undefined)

    expect(isModerator(sessionWith("tobias@basement.studio"))).toBe(false)
  })

  test("a listed email moderates", () => {
    setEnv("COMMUNITY_ADMIN_EMAILS", "tobias@basement.studio")

    expect(isModerator(sessionWith("tobias@basement.studio"))).toBe(true)
  })

  test("an unlisted email does not", () => {
    setEnv("COMMUNITY_ADMIN_EMAILS", "tobias@basement.studio")

    expect(isModerator(sessionWith("someone@else.com"))).toBe(false)
  })

  test("a signed-out visitor does not", () => {
    setEnv("COMMUNITY_ADMIN_EMAILS", "tobias@basement.studio")

    expect(isModerator(null)).toBe(false)
    expect(isModerator(sessionWith(null))).toBe(false)
  })
})

describe("isReportReason", () => {
  test("accepts every published reason", () => {
    for (const reason of REPORT_REASONS) {
      expect(isReportReason(reason)).toBe(true)
    }
  })

  test("rejects anything else, so the column cannot take free text", () => {
    expect(isReportReason("whatever")).toBe(false)
    expect(isReportReason("")).toBe(false)
    expect(isReportReason(null)).toBe(false)
    expect(isReportReason(undefined)).toBe(false)
    expect(isReportReason(42)).toBe(false)
    expect(isReportReason({ reason: "spam" })).toBe(false)
  })
})

describe("deleteScenePrefix guard", () => {
  const rejected = [
    "",
    "/",
    "scenes/",
    "scenes",
    "scenes//",
    "scenes/../",
    "scenes/scn_1",
    "scenes/scn_1/nested/",
    "other/scn_1/",
    "scenes/scn 1/",
    "*",
  ]

  test.each(rejected)("refuses to delete by %p", async (prefix) => {
    await expect(deleteScenePrefix(prefix)).rejects.toThrow(
      /Refusing to delete by prefix/
    )
  })

  test("the guard runs before any credential is needed", async () => {
    setEnv("R2_ACCESS_KEY_ID", undefined)
    setEnv("R2_BUCKET", undefined)

    await expect(deleteScenePrefix("")).rejects.toThrow(
      /Refusing to delete by prefix/
    )
  })
})
