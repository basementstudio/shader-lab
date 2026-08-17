import { afterEach, describe, expect, test } from "bun:test"
import {
  buildSceneSlug,
  dayBucket,
  decideQuota,
  MAX_DESCRIPTION_LENGTH,
  MAX_SCENES_PER_DAY,
  MAX_TITLE_LENGTH,
  MAX_TOTAL_BYTES,
  normalizeDescription,
  normalizeTitle,
  validateDraftPayload,
  validateProjectFilePayload,
} from "@/lib/community/publish"

const HOSTS_ENV = "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS"

afterEach(() => {
  delete process.env[HOSTS_ENV]
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
    expect(buildSceneSlug("!!!")).toMatch(/^scene-[a-z0-9_-]{6}$/)
    expect(buildSceneSlug("a")).toMatch(/^scene-[a-z0-9_-]{6}$/)
  })

  test("does not leave a dash before the suffix on a long title", () => {
    const slug = buildSceneSlug("z".repeat(80))

    expect(slug).not.toContain("--")
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

    expect(() => validateProjectFilePayload(payload)).toThrow(
      /untrusted host/
    )
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
    expect(() => validateProjectFilePayload("x".repeat(9 * 1024 * 1024))).toThrow(
      /too large/
    )
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

    expect(decideQuota({ addScene: false, bucket, bytes: 1024, current }).ok).toBe(
      true
    )
    expect(decideQuota({ addScene: true, bucket, bytes: 1024, current }).ok).toBe(
      false
    )
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
