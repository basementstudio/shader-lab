import { readEnv } from "@/lib/read-env"
import type { EditorAsset, PresetAssetReference } from "@/types/editor"
import { ASSET_KINDS } from "@/types/editor"

const BUILT_IN_ASSET_HOSTS = ["cloudflarestream.com", "videodelivery.net"]

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

export function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
}

function parseHostList(value: string | null | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0)
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")
}

export function getAllowedAssetHosts(): string[] {
  return [
    ...BUILT_IN_ASSET_HOSTS,
    ...parseHostList(readEnv("NEXT_PUBLIC_CF_IMAGES_HOST")),
    ...parseHostList(readEnv("NEXT_PUBLIC_R2_PUBLIC_HOST")),
    ...parseHostList(readEnv("NEXT_PUBLIC_COMMUNITY_ASSET_HOSTS")),
  ]
}

export function isAllowedAssetOrigin(rawUrl: string): boolean {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  const hostname = url.hostname.toLowerCase()
  const isAllowedHost = getAllowedAssetHosts().some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  )

  if (!isAllowedHost) {
    return false
  }

  if (url.protocol === "https:") {
    return true
  }

  return url.protocol === "http:" && isLoopbackHostname(hostname)
}

export function isRemoteAssetReference(
  ref: PresetAssetReference
): ref is PresetAssetReference & { url: string } {
  return typeof ref.url === "string" && ref.url.length > 0
}

export function collectRemoteAssets(
  references: readonly PresetAssetReference[],
  existingIds: ReadonlySet<string>
): EditorAsset[] {
  const remoteAssets: EditorAsset[] = []
  const seenIds = new Set(existingIds)

  for (const reference of references) {
    if (seenIds.has(reference.id)) {
      continue
    }

    const asset = createRemoteAsset(reference)

    if (asset) {
      seenIds.add(asset.id)
      remoteAssets.push(asset)
    }
  }

  return remoteAssets
}

export function createRemoteAsset(
  ref: PresetAssetReference
): EditorAsset | null {
  if (!(isRemoteAssetReference(ref) && isAllowedAssetOrigin(ref.url))) {
    return null
  }

  if (!ASSET_KINDS.includes(ref.kind)) {
    return null
  }

  return {
    createdAt: new Date().toISOString(),
    duration: ref.duration ?? null,
    error: null,
    fileName: ref.fileName,
    height: ref.height ?? null,
    id: ref.id,
    kind: ref.kind,
    mimeType: ref.mimeType ?? "",
    sizeBytes: ref.sizeBytes ?? 0,
    source: "remote",
    status: "ready",
    url: ref.url,
    width: ref.width ?? null,
  }
}
