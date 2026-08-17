import {
  ASSET_STORE,
  AUTOSAVE_ASSET_GRACE_MS,
  AUTOSAVE_MAX_ASSET_BYTES,
  AUTOSAVE_MAX_TOTAL_BYTES,
  AUTOSAVE_QUOTA_HEADROOM,
} from "@/lib/editor/autosave/limits"
import {
  deleteKeysFrom,
  putInto,
  readAllFrom,
} from "@/lib/editor/autosave/idb"
import type { AssetKind, EditorAsset } from "@/types/editor"

export interface StoredAsset {
  blob: Blob
  createdAt: number
  duration: number | null
  fileName: string
  height: number | null
  id: string
  kind: AssetKind
  mimeType: string
  sizeBytes: number
  width: number | null
}

export interface EvictionPlan {
  evict: string[]
  keptBytes: number
  overBudget: boolean
}

export function planAssetEviction(input: {
  graceMs?: number
  maxTotalBytes?: number
  now?: number
  records: readonly Pick<StoredAsset, "createdAt" | "id" | "sizeBytes">[]
  referencedIds: ReadonlySet<string>
}): EvictionPlan {
  const maxTotalBytes = input.maxTotalBytes ?? AUTOSAVE_MAX_TOTAL_BYTES
  const graceMs = input.graceMs ?? AUTOSAVE_ASSET_GRACE_MS
  const now = input.now ?? Date.now()

  const evict = input.records
    .filter(
      (record) =>
        !input.referencedIds.has(record.id) && now - record.createdAt > graceMs
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((record) => record.id)

  const keptBytes = input.records
    .filter((record) => input.referencedIds.has(record.id))
    .reduce((total, record) => total + record.sizeBytes, 0)

  return { evict, keptBytes, overBudget: keptBytes > maxTotalBytes }
}

export function exceedsAssetCap(sizeBytes: number): boolean {
  return sizeBytes > AUTOSAVE_MAX_ASSET_BYTES
}

async function hasRoomFor(sizeBytes: number): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return true
  }

  try {
    const { quota, usage } = await navigator.storage.estimate()

    if (!quota) {
      return true
    }

    return (usage ?? 0) + sizeBytes <= quota * AUTOSAVE_QUOTA_HEADROOM
  } catch {
    return true
  }
}

export async function persistAssetBlob(
  asset: EditorAsset,
  blob: Blob
): Promise<boolean> {
  if (exceedsAssetCap(asset.sizeBytes)) {
    return false
  }

  if (!(await hasRoomFor(asset.sizeBytes))) {
    return false
  }

  return putInto(ASSET_STORE, {
    blob,
    createdAt: Date.now(),
    duration: asset.duration,
    fileName: asset.fileName,
    height: asset.height,
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
  } satisfies StoredAsset)
}

export function readStoredAssets(): Promise<StoredAsset[] | null> {
  return readAllFrom<StoredAsset>(ASSET_STORE)
}

export function forgetStoredAssets(ids: readonly string[]): Promise<unknown> {
  return deleteKeysFrom(ASSET_STORE, ids)
}

export function collectAssetIdsInUse(
  projectFile: { assets: readonly { id: string }[] } | null
): Set<string> {
  return new Set(projectFile?.assets.map((asset) => asset.id) ?? [])
}

export function toEditorAsset(record: StoredAsset, url: string): EditorAsset {
  return {
    createdAt: new Date(record.createdAt).toISOString(),
    duration: record.duration,
    error: null,
    fileName: record.fileName,
    height: record.height,
    id: record.id,
    kind: record.kind,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    source: "local",
    status: "ready",
    url,
    width: record.width,
  }
}
