import { afterEach, describe, expect, test } from "bun:test"
import { resolveLabUrl, resolveThumbnailUrl } from "@/lib/community/scenes"

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

describe("resolveLabUrl", () => {
  test("passes through a local seed path untouched", () => {
    expect(resolveLabUrl("/community-seed/voxel-demo.lab.json")).toBe(
      "/community-seed/voxel-demo.lab.json"
    )
  })

  test("passes through an absolute https url untouched", () => {
    expect(resolveLabUrl("https://cdn.test/scenes/a.json")).toBe(
      "https://cdn.test/scenes/a.json"
    )
  })

  test("builds an R2 url from a bare key when the host is set", () => {
    setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", "assets.test")

    expect(resolveLabUrl("scenes/abc/scene.lab.json")).toBe(
      "https://assets.test/scenes/abc/scene.lab.json"
    )
  })

  test("returns the bare key when no host is configured", () => {
    setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", undefined)

    expect(resolveLabUrl("scenes/abc/scene.lab.json")).toBe(
      "scenes/abc/scene.lab.json"
    )
  })
})

describe("resolveThumbnailUrl", () => {
  test("returns null when there is no thumbnail", () => {
    expect(resolveThumbnailUrl(null)).toBeNull()
  })

  test("passes through local and absolute values", () => {
    expect(resolveThumbnailUrl("/examples/voxel.webp")).toBe(
      "/examples/voxel.webp"
    )
    expect(resolveThumbnailUrl("https://cdn.test/a.webp")).toBe(
      "https://cdn.test/a.webp"
    )
  })

  test("builds a Cloudflare Images variant url including the account hash", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "imagedelivery.net")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", "HASH123")

    expect(resolveThumbnailUrl("abc123")).toBe(
      "https://imagedelivery.net/HASH123/abc123/grid"
    )
  })

  test("tolerates a host written with a scheme", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "https://imagedelivery.net/")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", "HASH123")

    expect(resolveThumbnailUrl("abc123")).toBe(
      "https://imagedelivery.net/HASH123/abc123/grid"
    )
  })

  test("returns null without the account hash, rather than a broken url", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "imagedelivery.net")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", undefined)

    expect(resolveThumbnailUrl("abc123")).toBeNull()
  })

  test("returns null for a bare id when Images is not configured", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", undefined)

    expect(resolveThumbnailUrl("abc123")).toBeNull()
  })
})
