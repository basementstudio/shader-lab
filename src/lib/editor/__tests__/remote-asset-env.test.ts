import { describe, expect, test } from "bun:test"

const SOURCE_PATH = "src/lib/editor/remote-asset.ts"

async function readSource(): Promise<string> {
  return await Bun.file(SOURCE_PATH).text()
}

describe("client-side env access in remote-asset", () => {
  test("reads every NEXT_PUBLIC var as a static member expression", async () => {
    const source = await readSource()

    for (const name of [
      "NEXT_PUBLIC_CF_IMAGES_HOST",
      "NEXT_PUBLIC_R2_PUBLIC_HOST",
      "NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS",
    ]) {
      expect(source).toContain(`process.env.${name}`)
    }
  })

  test("never reads a NEXT_PUBLIC var through a dynamic lookup", async () => {
    const source = await readSource()

    expect(source).not.toMatch(/process\.env\[/)
    expect(source).not.toMatch(/readEnv\(\s*["'`]NEXT_PUBLIC/)
  })
})

describe("the origin allowlist survives a quoted host", () => {
  const CLEAN = "pub-example.r2.dev"
  const saved = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST

  async function hostsWith(raw: string | undefined): Promise<string[]> {
    if (raw === undefined) {
      delete process.env.NEXT_PUBLIC_R2_PUBLIC_HOST
    } else {
      process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = raw
    }

    const { getAllowedAssetHosts } = await import("@/lib/editor/remote-asset")

    return getAllowedAssetHosts()
  }

  test.each([
    `https://${CLEAN}`,
    `"https://${CLEAN}"`,
    `'https://${CLEAN}'`,
    `  "https://${CLEAN}"  `,
    CLEAN,
  ])("accepts the host written as %p", async (raw) => {
    try {
      expect(await hostsWith(raw)).toContain(CLEAN)
    } finally {
      if (saved === undefined) {
        delete process.env.NEXT_PUBLIC_R2_PUBLIC_HOST
      } else {
        process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = saved
      }
    }
  })
})
