import { afterEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { QueryBuilder } from "drizzle-orm/pg-core"
import {
  isModerator,
  retainedByAnotherSceneCondition,
  selectDeletableAssetKeys,
} from "@/lib/community/moderation"
import {
  deleteSceneObjects,
  keyFromPublicUrl,
  scenePrefixOf,
} from "@/lib/community/r2"
import { isReportReason, REPORT_REASONS } from "@/lib/community/report-reasons"
import { sceneAssets, scenes } from "@/lib/db/schema"

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

function configureR2() {
  setEnv("R2_ACCESS_KEY_ID", "key")
  setEnv("R2_SECRET_ACCESS_KEY", "secret")
  setEnv("R2_BUCKET", "bucket")
  setEnv("CLOUDFLARE_ACCOUNT_ID", "account")
  setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", "pub-example.r2.dev")
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

describe("keyFromPublicUrl", () => {
  test("recovers the object key from one of our urls", () => {
    configureR2()

    expect(
      keyFromPublicUrl("https://pub-example.r2.dev/scenes/scn_abc/file.mp4")
    ).toBe("scenes/scn_abc/file.mp4")
  })

  test("refuses a url on any other host, so a crafted asset url cannot target our bucket", () => {
    configureR2()

    expect(
      keyFromPublicUrl("https://evil.example.com/scenes/scn_abc/file.mp4")
    ).toBeNull()
  })

  test("refuses paths outside the scenes layout", () => {
    configureR2()

    for (const url of [
      "https://pub-example.r2.dev/scenes/scn_abc/nested/file.mp4",
      "https://pub-example.r2.dev/other/scn_abc/file.mp4",
      "https://pub-example.r2.dev/scenes/scn_abc/",
      "https://pub-example.r2.dev/",
      "not-a-url",
    ]) {
      expect(keyFromPublicUrl(url)).toBeNull()
    }
  })
})

describe("scenePrefixOf", () => {
  test("names the scene that owns an object", () => {
    expect(scenePrefixOf("scenes/scn_abc/file.mp4")).toBe("scenes/scn_abc")
  })

  test("returns nothing for a key it cannot attribute", () => {
    expect(scenePrefixOf("file.mp4")).toBeNull()
    expect(scenePrefixOf("other/scn_abc/file.mp4")).toBeNull()
  })
})

describe("retainedByAnotherSceneCondition", () => {
  function compile(urls: readonly string[]) {
    return new QueryBuilder()
      .select({ url: sceneAssets.url })
      .from(sceneAssets)
      .innerJoin(scenes, eq(scenes.id, sceneAssets.sceneId))
      .where(retainedByAnotherSceneCondition({ sceneId: "scn_own", urls }))
      .toSQL()
  }

  test("only a published scene can keep another scene's object alive", () => {
    const query = compile(["https://pub-example.r2.dev/scenes/scn_a/file.mp4"])

    expect(query.params).toContain("published")
    expect(query.params).not.toContain("draft")
    expect(query.params).not.toContain("processing")
  })

  test("a deleted or taken down scene retains nothing", () => {
    const query = compile(["https://pub-example.r2.dev/scenes/scn_a/file.mp4"])

    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.params).not.toContain("takendown")
  })
})

describe("selectDeletableAssetKeys", () => {
  const ownPrefix = "scenes/scn_own"
  const url = "https://pub-example.r2.dev/scenes/scn_own/file.mp4"

  test("a draft referencing the object cannot veto its deletion", () => {
    configureR2()

    expect(
      selectDeletableAssetKeys({
        assetUrls: [url],
        ownPrefix,
        retainedUrls: new Set(),
      })
    ).toEqual({ deletable: ["scenes/scn_own/file.mp4"], retained: 0 })
  })

  test("a published remix still keeps the object", () => {
    configureR2()

    expect(
      selectDeletableAssetKeys({
        assetUrls: [url],
        ownPrefix,
        retainedUrls: new Set([url]),
      })
    ).toEqual({ deletable: [], retained: 1 })
  })

  test("another author's object is never touched", () => {
    configureR2()

    expect(
      selectDeletableAssetKeys({
        assetUrls: [
          "https://pub-example.r2.dev/scenes/scn_other/file.mp4",
          "https://evil.example.com/scenes/scn_own/file.mp4",
        ],
        ownPrefix,
        retainedUrls: new Set(),
      })
    ).toEqual({ deletable: [], retained: 0 })
  })
})

describe("deleteSceneObjects", () => {
  test("deletes nothing when given nothing", async () => {
    expect(await deleteSceneObjects([])).toBe(0)
  })

  test("drops keys outside the scenes layout instead of sending them", async () => {
    setEnv("R2_ACCESS_KEY_ID", undefined)
    setEnv("R2_BUCKET", undefined)

    for (const key of [
      "",
      "/",
      "scenes/",
      "scenes/scn_abc",
      "scenes/scn_abc/nested/file.mp4",
      "other/scn_abc/file.mp4",
      "../secrets",
      "*",
    ]) {
      expect(await deleteSceneObjects([key])).toBe(0)
    }
  })
})
