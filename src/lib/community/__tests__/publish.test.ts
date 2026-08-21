import { afterEach, describe, expect, test } from "bun:test"
import {
  buildSceneSlug,
  dayBucket,
  decideQuota,
  findAssetOutsideScenePrefixes,
  MAX_ASSETS_PER_SCENE,
  MAX_DESCRIPTION_LENGTH,
  MAX_SCENES_PER_DAY,
  MAX_TITLE_LENGTH,
  MAX_TOTAL_BYTES,
  normalizeDescription,
  normalizeDraftTitle,
  normalizeTags,
  normalizeThumbnailUrl,
  normalizeTitle,
  planUploads,
  releaseQuota,
  reserveBytes,
  scenePrefixFor,
  validateDraftPayload,
  validateProjectFilePayload,
} from "@/lib/community/publish"
import { MAX_ASSET_BYTES } from "@/lib/community/upload-limits"
import { getDatabase } from "@/lib/db"

const HOSTS_ENV = "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS"
const R2_HOST = "pub-abc.r2.dev"

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

function configureR2() {
  setEnv("R2_ACCESS_KEY_ID", "key")
  setEnv("R2_SECRET_ACCESS_KEY", "secret")
  setEnv("R2_BUCKET", "bucket")
  setEnv("CLOUDFLARE_ACCOUNT_ID", "account")
  setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", R2_HOST)
}

afterEach(() => {
  delete process.env[HOSTS_ENV]

  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  saved.clear()
})

function labFile(assets: unknown[] = [], layerCount = 1) {
  return JSON.stringify({
    assets,
    composition: { height: 800, width: 1200 },
    format: "shader-lab",
    layers: Array.from({ length: layerCount }, (_unused, index) => ({
      assetId: null,
      blendMode: "normal",
      compositeMode: "filter",
      expanded: true,
      hue: 0,
      id: `layer-${index + 1}`,
      kind: "source",
      locked: false,
      maskConfig: { invert: false, mode: "multiply", source: "luminance" },
      name: "Gradient",
      opacity: 1,
      params: {},
      runtimeError: null,
      saturation: 1,
      type: "gradient",
      visible: true,
    })),
    selectedLayerId: null,
    timeline: { duration: 6, loop: true, tracks: [] },
    version: 5,
  })
}

describe("buildSceneSlug", () => {
  test("kebab-cases the title and appends a short unique suffix", () => {
    const slug = buildSceneSlug("My Cool Scene")

    expect(slug).toMatch(/^my-cool-scene-[a-z0-9_-]{6}$/)
  })

  test("two scenes with the same title do not collide", () => {
    expect(buildSceneSlug("Same Name")).not.toBe(buildSceneSlug("Same Name"))
  })

  test("falls back for titles with nothing sluggable", () => {
    expect(buildSceneSlug("!!!")).toMatch(/^scene-[a-z0-9]{6}$/)
    expect(buildSceneSlug("a")).toMatch(/^scene-[a-z0-9]{6}$/)
  })

  test("does not leave a dash before the suffix on a long title", () => {
    const slug = buildSceneSlug("z".repeat(80))

    expect(slug).not.toContain("--")
  })

  test("keeps the random suffix free of url-noisy characters", () => {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      expect(buildSceneSlug("A Scene")).toMatch(/^a-scene-[0-9a-z]{6}$/)
    }
  })
})

describe("normalizeTitle", () => {
  test("trims", () => {
    expect(normalizeTitle("  Hello  ")).toBe("Hello")
  })

  test("rejects an empty or non-string title", () => {
    for (const value of ["", "   ", null, undefined, 42, {}]) {
      expect(() => normalizeTitle(value)).toThrow("A title is required.")
    }
  })

  test("truncates rather than rejecting a long title", () => {
    expect(normalizeTitle("x".repeat(500))).toHaveLength(MAX_TITLE_LENGTH)
  })
})

describe("normalizeDescription", () => {
  test("returns null for nothing usable", () => {
    for (const value of ["", "  ", null, undefined, 5]) {
      expect(normalizeDescription(value)).toBeNull()
    }
  })

  test("trims and truncates", () => {
    expect(normalizeDescription("  hi  ")).toBe("hi")
    expect(normalizeDescription("y".repeat(900))).toHaveLength(
      MAX_DESCRIPTION_LENGTH
    )
  })
})

describe("normalizeTags", () => {
  test("treats a missing or non-array value as no tags", () => {
    for (const value of [null, undefined, "glitch", 5, {}]) {
      expect(normalizeTags(value)).toEqual([])
    }
  })

  test("normalizes case and whitespace and removes duplicates", () => {
    expect(normalizeTags([" Glitch ", "glitch", " NATURE "])).toEqual([
      "glitch",
      "nature",
    ])
  })

  test("rejects tags outside the curated set", () => {
    expect(() => normalizeTags(["glitch", "watercolor"])).toThrow(
      /available options/i
    )
  })

  test("rejects more than three unique tags", () => {
    expect(() =>
      normalizeTags(["abstract", "background", "glitch", "nature"])
    ).toThrow(/up to 3 tags/i)
  })
})

describe("dayBucket", () => {
  test("is a UTC calendar day", () => {
    expect(dayBucket(new Date("2026-08-12T23:59:59Z"))).toBe("2026-08-12")
    expect(dayBucket(new Date("2026-08-13T00:00:01Z"))).toBe("2026-08-13")
  })
})

describe("validateProjectFilePayload", () => {
  test("accepts a scene with no assets", () => {
    const result = validateProjectFilePayload(labFile())

    expect(result.layerTypes).toEqual(["gradient"])
    expect(result.hasCustomShader).toBe(false)
  })

  test("rejects an asset that was never uploaded", () => {
    const payload = labFile([
      { fileName: "photo.png", id: "a1", kind: "image" },
    ])

    expect(() => validateProjectFilePayload(payload)).toThrow(
      /was not uploaded/
    )
  })

  test("rejects an asset pointing at an untrusted host", () => {
    const payload = labFile([
      {
        fileName: "photo.png",
        id: "a1",
        kind: "image",
        url: "https://evil.test/photo.png",
      },
    ])

    expect(() => validateProjectFilePayload(payload)).toThrow(/untrusted host/)
  })

  test("accepts an asset on an allowlisted host", () => {
    process.env[HOSTS_ENV] = "pub-abc.r2.dev"

    const payload = labFile([
      {
        fileName: "photo.png",
        id: "a1",
        kind: "image",
        url: "https://pub-abc.r2.dev/scenes/x/hash.png",
      },
    ])

    expect(() => validateProjectFilePayload(payload)).not.toThrow()
  })

  test("rejects a payload that is not a valid project file", () => {
    expect(() => validateProjectFilePayload("{}")).toThrow()
    expect(() => validateProjectFilePayload("not json")).toThrow()
  })

  test("rejects an oversized payload before parsing it", () => {
    expect(() =>
      validateProjectFilePayload("x".repeat(9 * 1024 * 1024))
    ).toThrow(/too large/)
  })
})

describe("validateDraftPayload", () => {
  test("accepts a scene with no layers at all", () => {
    const result = validateDraftPayload(labFile([], 0))

    expect(result.layerTypes).toEqual([])
    expect(result.projectFile.layers).toEqual([])
  })

  test("keeps an asset that was uploaded", () => {
    process.env[HOSTS_ENV] = "pub-abc.r2.dev"

    const result = validateDraftPayload(
      labFile([
        {
          fileName: "photo.png",
          id: "a1",
          kind: "image",
          url: "https://pub-abc.r2.dev/scenes/x/hash.png",
        },
      ])
    )

    expect(result.projectFile.assets.map((asset) => asset.id)).toEqual(["a1"])
  })

  test("drops an asset that has no url rather than refusing to save", () => {
    const result = validateDraftPayload(
      labFile([{ fileName: "photo.png", id: "a1", kind: "image" }])
    )

    expect(result.projectFile.assets).toEqual([])
  })

  test("still refuses a url pointing at an untrusted host", () => {
    expect(() =>
      validateDraftPayload(
        labFile([
          {
            fileName: "photo.png",
            id: "a1",
            kind: "image",
            url: "https://evil.test/photo.png",
          },
        ])
      )
    ).toThrow(/untrusted host/)
  })

  test("still refuses an oversized payload", () => {
    expect(() => validateDraftPayload("x".repeat(9 * 1024 * 1024))).toThrow(
      /too large/
    )
  })

  test("still refuses something that is not a project file", () => {
    expect(() => validateDraftPayload("{}")).toThrow()
  })
})

describe("decideQuota", () => {
  const bucket = "2026-08-17"

  test("allows a first write with no row yet", () => {
    expect(
      decideQuota({ addScene: true, bucket, bytes: 1024, current: null }).ok
    ).toBe(true)
  })

  test("a draft save is not blocked by the daily scene cap", () => {
    const current = {
      bytesUsed: 0,
      dayBucket: bucket,
      scenesToday: MAX_SCENES_PER_DAY,
    }

    expect(
      decideQuota({ addScene: false, bucket, bytes: 1024, current }).ok
    ).toBe(true)
    expect(
      decideQuota({ addScene: true, bucket, bytes: 1024, current }).ok
    ).toBe(false)
  })

  test("the daily scene cap resets when the bucket rolls over", () => {
    const current = {
      bytesUsed: 0,
      dayBucket: "2026-08-16",
      scenesToday: MAX_SCENES_PER_DAY,
    }

    expect(decideQuota({ addScene: true, bucket, bytes: 0, current }).ok).toBe(
      true
    )
  })

  test("the byte cap applies to drafts too, and does not reset daily", () => {
    const current = {
      bytesUsed: MAX_TOTAL_BYTES,
      dayBucket: "2026-08-16",
      scenesToday: 0,
    }

    const decision = decideQuota({
      addScene: false,
      bucket,
      bytes: 1,
      current,
    })

    expect(decision.ok).toBe(false)
    expect(decision.reason).toMatch(/storage limit/)
  })

  test("allows a write that lands exactly on the byte cap", () => {
    expect(
      decideQuota({
        addScene: false,
        bucket,
        bytes: 1024,
        current: {
          bytesUsed: MAX_TOTAL_BYTES - 1024,
          dayBucket: bucket,
          scenesToday: 0,
        },
      }).ok
    ).toBe(true)
  })

  test("reports the scene cap before the byte cap", () => {
    const decision = decideQuota({
      addScene: true,
      bucket,
      bytes: MAX_TOTAL_BYTES * 2,
      current: {
        bytesUsed: MAX_TOTAL_BYTES,
        dayBucket: bucket,
        scenesToday: MAX_SCENES_PER_DAY,
      },
    })

    expect(decision.reason).toMatch(/scenes today/)
  })
})

describe("a client-declared sizeBytes cannot move the quota", () => {
  test("a negative sizeBytes is refused before it can be charged", () => {
    process.env[HOSTS_ENV] = R2_HOST

    const payload = labFile([
      {
        fileName: "photo.png",
        id: "a1",
        kind: "image",
        sizeBytes: -500_000_000,
        url: `https://${R2_HOST}/scenes/scn_a/hash.png`,
      },
    ])

    expect(() => validateProjectFilePayload(payload)).toThrow()
    expect(() => validateDraftPayload(payload)).toThrow()
  })

  test("a fractional sizeBytes is refused too", () => {
    process.env[HOSTS_ENV] = R2_HOST

    expect(() =>
      validateDraftPayload(
        labFile([
          {
            fileName: "photo.png",
            id: "a1",
            kind: "image",
            sizeBytes: 1.5,
            url: `https://${R2_HOST}/scenes/scn_a/hash.png`,
          },
        ])
      )
    ).toThrow()
  })

  test("reserveBytes refuses an impossible charge without reaching sql", async () => {
    setEnv("COMMUNITY_DATABASE_URL", undefined)
    setEnv("DATABASE_URL", undefined)

    expect(() => getDatabase()).toThrow(/No database url/)

    for (const bytes of [
      -1,
      -500_000_000,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const decision = await reserveBytes("user-1", bytes)

      expect(decision.ok).toBe(false)
      expect(decision.reason).toMatch(/not valid/)
    }
  })

  test("releaseQuota treats a negative refund as nothing to refund", async () => {
    setEnv("COMMUNITY_DATABASE_URL", undefined)
    setEnv("DATABASE_URL", undefined)

    expect(
      await releaseQuota("user-1", { bytes: -100, scenes: -2 })
    ).toBeUndefined()
  })
})

describe("planUploads", () => {
  const draftId = "scn_aaaaaaaaaaaaaaaa"
  const videoSha = "a".repeat(64)
  const imageSha = "b".repeat(64)

  function videoUpload(sha256: string, contentLength: number) {
    return { contentLength, contentType: "video/mp4", kind: "video", sha256 }
  }

  test("keys every upload under the draft's own prefix", () => {
    const plan = planUploads({
      draftId,
      requested: [videoUpload(videoSha, 1024)],
      storedUrls: new Map(),
    })

    if ("error" in plan) {
      throw new Error(plan.error)
    }

    expect(plan.uploads[0]?.key).toBe(
      `${scenePrefixFor(draftId)}/${videoSha}.mp4`
    )
    expect(plan.signedBytes).toBe(1024)
  })

  test("charges only the uploads it is about to sign", () => {
    const plan = planUploads({
      draftId,
      requested: [videoUpload(videoSha, 4096), videoUpload(imageSha, 1024)],
      storedUrls: new Map([
        [videoSha, `https://${R2_HOST}/${scenePrefixFor(draftId)}/paid.mp4`],
      ]),
    })

    if ("error" in plan) {
      throw new Error(plan.error)
    }

    expect(plan.signedBytes).toBe(1024)
    expect(plan.uploads[0]?.storedUrl).toContain("paid.mp4")
    expect(plan.uploads[1]?.storedUrl).toBeNull()
  })

  test("charges a repeated upload once", () => {
    const plan = planUploads({
      draftId,
      requested: [videoUpload(videoSha, 4096), videoUpload(videoSha, 4096)],
      storedUrls: new Map(),
    })

    if ("error" in plan) {
      throw new Error(plan.error)
    }

    expect(plan.signedBytes).toBe(4096)
  })

  test("refuses an unsupported type, a bad hash, or a size we cannot trust", () => {
    const cases = [
      { contentLength: 1024, contentType: "text/html", sha256: videoSha },
      { contentLength: 1024, contentType: "video/mp4", sha256: "nope" },
      { contentLength: 0, contentType: "video/mp4", sha256: videoSha },
      { contentLength: -1024, contentType: "video/mp4", sha256: videoSha },
      { contentLength: 10.5, contentType: "video/mp4", sha256: videoSha },
      {
        contentLength: MAX_ASSET_BYTES + 1,
        contentType: "video/mp4",
        sha256: videoSha,
      },
    ]

    for (const requested of cases) {
      const plan = planUploads({
        draftId,
        requested: [requested],
        storedUrls: new Map(),
      })

      expect("error" in plan).toBe(true)
    }
  })

  test("a request that would sign more than the whole allowance is refused", () => {
    const plan = planUploads({
      draftId,
      requested: Array.from({ length: MAX_ASSETS_PER_SCENE + 1 }, (_, index) =>
        videoUpload(`${index}`.padStart(64, "c").slice(0, 64), MAX_ASSET_BYTES)
      ),
      storedUrls: new Map(),
    })

    if ("error" in plan) {
      throw new Error(plan.error)
    }

    expect(plan.signedBytes).toBeGreaterThan(MAX_TOTAL_BYTES)

    const decision = decideQuota({
      addScene: false,
      bucket: "2026-08-17",
      bytes: plan.signedBytes,
      current: null,
    })

    expect(decision.ok).toBe(false)
    expect(decision.reason).toMatch(/storage limit/)
  })
})

describe("normalizeThumbnailUrl", () => {
  test("returns null when there is no thumbnail", () => {
    for (const value of [null, undefined, "", "   ", 42, {}]) {
      expect(normalizeThumbnailUrl(value)).toBeNull()
    }
  })

  test("accepts a thumbnail on an allowlisted host", () => {
    configureR2()

    expect(
      normalizeThumbnailUrl(`https://${R2_HOST}/scenes/scn_a/thumb.jpg`)
    ).toBe(`https://${R2_HOST}/scenes/scn_a/thumb.jpg`)
  })

  test("refuses a thumbnail on any other host", () => {
    configureR2()

    for (const value of [
      "https://evil.test/thumb.jpg",
      "http://evil.test/thumb.jpg",
      `https://evil.test/?next=https://${R2_HOST}/thumb.jpg`,
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/scenes/scn_a/thumb.jpg",
      "//evil.test/thumb.jpg",
    ]) {
      expect(() => normalizeThumbnailUrl(value)).toThrow(/untrusted host/)
    }
  })
})

describe("findAssetOutsideScenePrefixes", () => {
  function projectFileWith(url: string) {
    configureR2()

    return validateDraftPayload(
      labFile([{ fileName: "photo.png", id: "a1", kind: "image", url }])
    ).projectFile
  }

  test("accepts an object the scene owns", () => {
    const projectFile = projectFileWith(
      `https://${R2_HOST}/scenes/scn_own/hash.png`
    )

    expect(
      findAssetOutsideScenePrefixes(
        projectFile,
        new Set([scenePrefixFor("scn_own")])
      )
    ).toBeNull()
  })

  test("accepts an object a remix inherited from an ancestor", () => {
    const projectFile = projectFileWith(
      `https://${R2_HOST}/scenes/scn_grandparent/hash.png`
    )

    expect(
      findAssetOutsideScenePrefixes(
        projectFile,
        new Set([
          scenePrefixFor("scn_own"),
          scenePrefixFor("scn_parent"),
          scenePrefixFor("scn_grandparent"),
        ])
      )
    ).toBeNull()
  })

  test("names an object that belongs to an unrelated scene", () => {
    const projectFile = projectFileWith(
      `https://${R2_HOST}/scenes/scn_someoneelse/hash.png`
    )

    expect(
      findAssetOutsideScenePrefixes(
        projectFile,
        new Set([scenePrefixFor("scn_own"), scenePrefixFor("scn_parent")])
      )
    ).toBe("photo.png")
  })

  test("leaves an allowlisted host that is not our bucket alone", () => {
    const projectFile = projectFileWith(
      "https://customer-x.cloudflarestream.com/abc/manifest/video.m3u8"
    )

    expect(
      findAssetOutsideScenePrefixes(
        projectFile,
        new Set([scenePrefixFor("scn_own")])
      )
    ).toBeNull()
  })
})

describe("publishing refuses a bad word outright", () => {
  test("a slur in the title stops the publish", () => {
    expect(() => normalizeTitle("nigger")).toThrow(
      /we can't publish that.*the title/i
    )
  })

  test("ordinary swearing stops it too, now that everything blocks", () => {
    expect(() => normalizeTitle("fuck this gradient")).toThrow(
      /we can't publish that.*the title/i
    )
    expect(() => normalizeDescription("a fucking noise field")).toThrow(
      /we can't publish that.*the description/i
    )
  })

  test("the house additions stop it", () => {
    for (const word of ["goy", "goys", "goyim"]) {
      expect(() => normalizeTitle(word)).toThrow(/we can't publish that/i)
    }
  })

  test("a bad word anywhere in the scene stops it", () => {
    const raw = labFile()
    const dirty = raw.replace('"name":"Gradient"', '"name":"NIGGER"')

    expect(() => validateProjectFilePayload(dirty)).toThrow(
      /we can't publish that/i
    )
  })

  test("the block reads the payload before the censor can hide it", () => {
    const raw = labFile()
    const dirty = raw.replace('"name":"Gradient"', '"name":"fuck"')

    expect(() => validateProjectFilePayload(dirty)).toThrow(
      /we can't publish that/i
    )
  })

  test("the message never repeats the word back", () => {
    let message = ""

    try {
      normalizeTitle("nigger")
    } catch (cause) {
      message = cause instanceof Error ? cause.message : ""
    }

    expect(message).not.toMatch(/nig/i)
  })

  test("a clean title and description pass through untouched", () => {
    expect(normalizeTitle("  Drift Study  ")).toBe("Drift Study")
    expect(normalizeDescription("  a calm noise field  ")).toBe(
      "a calm noise field"
    )
  })

  test("length caps still apply", () => {
    expect(normalizeTitle("a".repeat(200))).toHaveLength(MAX_TITLE_LENGTH)
    expect(normalizeDescription("b".repeat(900))).toHaveLength(
      MAX_DESCRIPTION_LENGTH
    )
  })

  test("a clean scene is stored byte-for-byte as it arrived", () => {
    const raw = labFile()

    expect(validateProjectFilePayload(raw).body).toBe(raw)
    expect(validateDraftPayload(raw).body).toBe(raw)
  })
})

describe("drafts stay permissive, and censor instead", () => {
  test("a draft still saves what a publish will not", () => {
    const raw = labFile()
    const dirty = raw.replace('"name":"Gradient"', '"name":"NIGGER"')

    expect(() => validateDraftPayload(dirty)).not.toThrow()
  })

  test("a draft title is masked, not refused", () => {
    expect(normalizeDraftTitle("nigger")).toBe("******")
    expect(normalizeDraftTitle("shit sketch")).toBe("**** sketch")
  })

  test("the draft body it stores is censored", () => {
    const raw = labFile()
    const dirty = raw.replace('"name":"Gradient"', '"name":"fuck"')
    const validated = validateDraftPayload(dirty)

    expect(validated.projectFile.layers[0]?.name).toBe("****")
    expect(validated.body).not.toContain("fuck")
  })
})
