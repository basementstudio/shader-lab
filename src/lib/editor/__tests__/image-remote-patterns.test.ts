import { afterEach, describe, expect, test } from "bun:test"
import { getAllowedAssetHosts } from "@/lib/editor/remote-asset"
import {
  allowedAssetImageHosts,
  allowedAssetImagePatterns,
} from "../../../../next.config"

const HOST_VARS = [
  "NEXT_PUBLIC_CF_IMAGES_HOST",
  "NEXT_PUBLIC_R2_PUBLIC_HOST",
  "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS",
] as const

const saved = new Map<string, string | undefined>()

function setHostVar(name: string, value: string | undefined) {
  if (!saved.has(name)) {
    saved.set(name, process.env[name])
  }

  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function clearHostVars() {
  for (const name of HOST_VARS) {
    setHostVar(name, undefined)
  }
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  saved.clear()
})

describe("the image host allowlist matches the asset origin allowlist", () => {
  test.each([
    ["nothing configured", undefined, undefined, undefined],
    [
      "the documented defaults",
      "imagedelivery.net",
      "pub-example.r2.dev",
      undefined,
    ],
    [
      "hosts written with a scheme, a port and a path",
      "https://imagedelivery.net",
      "https://pub-example.r2.dev:443/bucket",
      "http://cdn.example.com/assets",
    ],
    [
      "values a platform env field wrapped in quotes",
      '"imagedelivery.net"',
      "'https://pub-example.r2.dev'",
      '  "cdn.example.com"  ',
    ],
    [
      "comma separated lists",
      "imagedelivery.net",
      "pub-a.r2.dev,pub-b.r2.dev",
      "one.example.com, two.example.com , localhost",
    ],
    [
      "mixed case hosts",
      "ImageDelivery.NET",
      "PUB-Example.R2.dev",
      "CDN.Example.com",
    ],
  ])("agrees for %s", (_label, cfImages, r2Public, communityHosts) => {
    clearHostVars()
    setHostVar("NEXT_PUBLIC_CF_IMAGES_HOST", cfImages)
    setHostVar("NEXT_PUBLIC_R2_PUBLIC_HOST", r2Public)
    setHostVar("NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS", communityHosts)

    expect(sorted(allowedAssetImageHosts())).toEqual(
      sorted(getAllowedAssetHosts())
    )
  })
})

describe("allowedAssetImagePatterns", () => {
  test("covers each host exactly and as a subdomain wildcard", () => {
    clearHostVars()
    setHostVar("NEXT_PUBLIC_R2_PUBLIC_HOST", "pub-example.r2.dev")

    const hostnames = allowedAssetImagePatterns().map(
      (pattern) => pattern.hostname
    )

    for (const host of getAllowedAssetHosts()) {
      expect(hostnames).toContain(host)
      expect(hostnames).toContain(`**.${host}`)
    }
  })

  test("serves the built-in stream hosts with no env set", () => {
    clearHostVars()

    const hostnames = allowedAssetImagePatterns().map(
      (pattern) => pattern.hostname
    )

    expect(hostnames).toContain("cloudflarestream.com")
    expect(hostnames).toContain("videodelivery.net")
  })

  test("never emits a quote character in a hostname", () => {
    clearHostVars()
    setHostVar("NEXT_PUBLIC_CF_IMAGES_HOST", '"imagedelivery.net"')

    for (const pattern of allowedAssetImagePatterns()) {
      expect(pattern.hostname).not.toMatch(/["']/)
    }
  })

  test("emits no duplicate patterns when two vars name the same host", () => {
    clearHostVars()
    setHostVar("NEXT_PUBLIC_CF_IMAGES_HOST", "imagedelivery.net")
    setHostVar("NEXT_PUBLIC_R2_PUBLIC_HOST", "imagedelivery.net")

    const keys = allowedAssetImagePatterns().map(
      (pattern) => `${pattern.protocol}://${pattern.hostname}`
    )

    expect(new Set(keys).size).toBe(keys.length)
  })

  test("only allows https", () => {
    clearHostVars()

    for (const pattern of allowedAssetImagePatterns()) {
      expect(pattern.protocol).toBe("https")
    }
  })
})
