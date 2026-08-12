import { afterEach, describe, expect, test } from "bun:test"
import {
  collectRemoteAssets,
  createRemoteAsset,
  isAllowedAssetOrigin,
  normalizeHost,
} from "@/lib/editor/remote-asset"
import type { PresetAssetReference } from "@/types/editor"

const HOSTS_ENV = "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS"

function withAllowedHosts(value: string) {
  process.env[HOSTS_ENV] = value
}

afterEach(() => {
  delete process.env[HOSTS_ENV]
})

describe("isAllowedAssetOrigin", () => {
  test("rejects a host that is not on the allowlist", () => {
    expect(isAllowedAssetOrigin("https://evil.test/pixel.png")).toBe(false)
  })

  test("accepts the built-in Cloudflare Stream hosts", () => {
    expect(isAllowedAssetOrigin("https://videodelivery.net/uid/x.mp4")).toBe(
      true
    )
    expect(isAllowedAssetOrigin("https://cloudflarestream.com/uid/x.mp4")).toBe(
      true
    )
  })

  test("accepts a subdomain of an allowlisted host", () => {
    expect(
      isAllowedAssetOrigin(
        "https://customer-abc123.cloudflarestream.com/uid/downloads/default.mp4"
      )
    ).toBe(true)
  })

  test("rejects lookalike hosts that merely contain an allowlisted host", () => {
    const lookalikes = [
      "https://evil-cloudflarestream.com/x.mp4",
      "https://cloudflarestream.com.evil.test/x.mp4",
      "https://notvideodelivery.net/x.mp4",
    ]

    for (const url of lookalikes) {
      expect(isAllowedAssetOrigin(url)).toBe(false)
    }
  })

  test("rejects a plaintext downgrade on a remote allowlisted host", () => {
    expect(isAllowedAssetOrigin("http://videodelivery.net/uid/x.mp4")).toBe(
      false
    )
  })

  test("allows http only for an explicitly allowlisted loopback host", () => {
    expect(isAllowedAssetOrigin("http://localhost:3000/a.png")).toBe(false)

    withAllowedHosts("localhost")

    expect(isAllowedAssetOrigin("http://localhost:3000/a.png")).toBe(true)
    expect(isAllowedAssetOrigin("http://127.0.0.1:3000/a.png")).toBe(false)
  })

  test("rejects non-http schemes even when the host list is permissive", () => {
    withAllowedHosts("localhost,videodelivery.net")

    const hostile = [
      "data:image/png;base64,iVBORw0KGgo=",
      "javascript:alert(1)",
      "blob:https://videodelivery.net/abc",
      "file:///etc/passwd",
    ]

    for (const url of hostile) {
      expect(isAllowedAssetOrigin(url)).toBe(false)
    }
  })

  test("rejects strings that are not absolute URLs", () => {
    for (const url of ["", "not a url", "/relative/path.png", "//cdn/x.png"]) {
      expect(isAllowedAssetOrigin(url)).toBe(false)
    }
  })

  test("reads additional hosts from the environment as a comma list", () => {
    withAllowedHosts(" cdn.example.test , other.test ")

    expect(isAllowedAssetOrigin("https://cdn.example.test/a.png")).toBe(true)
    expect(isAllowedAssetOrigin("https://other.test/a.png")).toBe(true)
    expect(isAllowedAssetOrigin("https://third.test/a.png")).toBe(false)
  })
})

describe("createRemoteAsset", () => {
  function reference(
    overrides: Partial<PresetAssetReference> = {}
  ): PresetAssetReference {
    return {
      fileName: "clip.mp4",
      id: "asset-1",
      kind: "video",
      ...overrides,
    }
  }

  test("returns null for a reference with no url", () => {
    expect(createRemoteAsset(reference())).toBeNull()
  })

  test("returns null for a url on a disallowed origin", () => {
    expect(
      createRemoteAsset(reference({ url: "https://evil.test/clip.mp4" }))
    ).toBeNull()
  })

  test("returns null for an unrecognised asset kind", () => {
    expect(
      createRemoteAsset(
        reference({
          kind: "executable" as PresetAssetReference["kind"],
          url: "https://videodelivery.net/uid/clip.mp4",
        })
      )
    ).toBeNull()
  })

  test("builds a ready remote asset carrying the reference metadata", () => {
    const asset = createRemoteAsset(
      reference({
        duration: 12.5,
        height: 1080,
        mimeType: "video/mp4",
        sizeBytes: 2048,
        url: "https://videodelivery.net/uid/clip.mp4",
        width: 1920,
      })
    )

    expect(asset).not.toBeNull()
    expect(asset?.source).toBe("remote")
    expect(asset?.status).toBe("ready")
    expect(asset?.error).toBeNull()
    expect(asset?.url).toBe("https://videodelivery.net/uid/clip.mp4")
    expect(asset?.duration).toBe(12.5)
    expect(asset?.width).toBe(1920)
    expect(asset?.height).toBe(1080)
    expect(asset?.mimeType).toBe("video/mp4")
    expect(asset?.sizeBytes).toBe(2048)
  })

  test("defaults metadata that the reference omits", () => {
    const asset = createRemoteAsset(
      reference({ url: "https://videodelivery.net/uid/clip.mp4" })
    )

    expect(asset?.duration).toBeNull()
    expect(asset?.width).toBeNull()
    expect(asset?.height).toBeNull()
    expect(asset?.mimeType).toBe("")
    expect(asset?.sizeBytes).toBe(0)
  })
})

describe("collectRemoteAssets", () => {
  const allowed = "https://videodelivery.net/uid/clip.mp4"

  test("ignores references that are already loaded locally", () => {
    const collected = collectRemoteAssets(
      [{ fileName: "clip.mp4", id: "asset-1", kind: "video", url: allowed }],
      new Set(["asset-1"])
    )

    expect(collected).toEqual([])
  })

  test("skips local-only references so relinking still applies to them", () => {
    const collected = collectRemoteAssets(
      [{ fileName: "photo.png", id: "asset-1", kind: "image" }],
      new Set()
    )

    expect(collected).toEqual([])
  })

  test("drops disallowed references but keeps the allowed ones", () => {
    const collected = collectRemoteAssets(
      [
        { fileName: "a.mp4", id: "good", kind: "video", url: allowed },
        {
          fileName: "b.mp4",
          id: "bad",
          kind: "video",
          url: "https://evil.test/b.mp4",
        },
      ],
      new Set()
    )

    expect(collected).toHaveLength(1)
    expect(collected[0]?.id).toBe("good")
  })

  test("does not emit the same asset id twice", () => {
    const collected = collectRemoteAssets(
      [
        { fileName: "a.mp4", id: "dup", kind: "video", url: allowed },
        { fileName: "a.mp4", id: "dup", kind: "video", url: allowed },
      ],
      new Set()
    )

    expect(collected).toHaveLength(1)
  })
})

describe("normalizeHost", () => {
  test("strips a scheme, because Cloudflare hands you the host with https:// on it", () => {
    expect(normalizeHost("https://pub-abc.r2.dev")).toBe("pub-abc.r2.dev")
    expect(normalizeHost("http://pub-abc.r2.dev")).toBe("pub-abc.r2.dev")
  })

  test("leaves a bare host alone", () => {
    expect(normalizeHost("pub-abc.r2.dev")).toBe("pub-abc.r2.dev")
  })

  test("strips paths, trailing slashes, ports and case", () => {
    expect(normalizeHost("HTTPS://Pub-ABC.R2.DEV/")).toBe("pub-abc.r2.dev")
    expect(normalizeHost("https://pub-abc.r2.dev/scenes/x")).toBe("pub-abc.r2.dev")
    expect(normalizeHost("  localhost:3000  ")).toBe("localhost")
  })

  test("an allowlist entry written with a scheme still matches", () => {
    process.env[HOSTS_ENV] = "https://pub-abc.r2.dev/"

    expect(isAllowedAssetOrigin("https://pub-abc.r2.dev/scenes/a.png")).toBe(true)
    expect(isAllowedAssetOrigin("https://other.test/a.png")).toBe(false)
  })
})
