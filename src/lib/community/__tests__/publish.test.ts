import { afterEach, describe, expect, test } from "bun:test"
import {
  buildSceneSlug,
  dayBucket,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeDescription,
  normalizeTitle,
  validateProjectFilePayload,
} from "@/lib/community/publish"

const HOSTS_ENV = "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS"

afterEach(() => {
  delete process.env[HOSTS_ENV]
})

function labFile(assets: unknown[] = []) {
  return JSON.stringify({
    assets,
    composition: { height: 800, width: 1200 },
    format: "shader-lab",
    layers: [
      {
        assetId: null,
        blendMode: "normal",
        compositeMode: "filter",
        expanded: true,
        hue: 0,
        id: "layer-1",
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
      },
    ],
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
