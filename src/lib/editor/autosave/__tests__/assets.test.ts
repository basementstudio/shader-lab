import { describe, expect, test } from "bun:test"
import {
  collectAssetIdsInUse,
  exceedsAssetCap,
  planAssetEviction,
  toEditorAsset,
} from "@/lib/editor/autosave/assets"
import { AUTOSAVE_MAX_ASSET_BYTES } from "@/lib/editor/autosave/limits"

const MB = 1024 * 1024

function stored(id: string, sizeBytes: number, createdAt: number) {
  return { createdAt, id, sizeBytes }
}

describe("planAssetEviction", () => {
  test("evicts nothing when every record is referenced", () => {
    const plan = planAssetEviction({
      records: [stored("a", MB, 1), stored("b", MB, 2)],
      referencedIds: new Set(["a", "b"]),
    })

    expect(plan.evict).toEqual([])
    expect(plan.keptBytes).toBe(2 * MB)
    expect(plan.overBudget).toBe(false)
  })

  test("evicts unreferenced records oldest first", () => {
    const plan = planAssetEviction({
      records: [
        stored("new", MB, 300),
        stored("old", MB, 100),
        stored("mid", MB, 200),
        stored("keep", MB, 400),
      ],
      referencedIds: new Set(["keep"]),
    })

    expect(plan.evict).toEqual(["old", "mid", "new"])
  })

  test("never evicts a referenced record, even far over budget", () => {
    const plan = planAssetEviction({
      maxTotalBytes: 10 * MB,
      records: [
        stored("huge-1", 200 * MB, 1),
        stored("huge-2", 200 * MB, 2),
      ],
      referencedIds: new Set(["huge-1", "huge-2"]),
    })

    expect(plan.evict).toEqual([])
    expect(plan.overBudget).toBe(true)
    expect(plan.keptBytes).toBe(400 * MB)
  })

  test("reports over budget while still reclaiming what it can", () => {
    const plan = planAssetEviction({
      maxTotalBytes: 10 * MB,
      records: [stored("kept", 50 * MB, 1), stored("junk", 5 * MB, 2)],
      referencedIds: new Set(["kept"]),
    })

    expect(plan.evict).toEqual(["junk"])
    expect(plan.overBudget).toBe(true)
  })

  test("handles an empty store", () => {
    const plan = planAssetEviction({
      records: [],
      referencedIds: new Set(),
    })

    expect(plan.evict).toEqual([])
    expect(plan.keptBytes).toBe(0)
    expect(plan.overBudget).toBe(false)
  })
})

describe("exceedsAssetCap", () => {
  test("refuses anything over the per-asset cap", () => {
    expect(exceedsAssetCap(AUTOSAVE_MAX_ASSET_BYTES + 1)).toBe(true)
    expect(exceedsAssetCap(100 * MB)).toBe(true)
  })

  test("accepts everything at or under it", () => {
    expect(exceedsAssetCap(AUTOSAVE_MAX_ASSET_BYTES)).toBe(false)
    expect(exceedsAssetCap(2 * MB)).toBe(false)
    expect(exceedsAssetCap(0)).toBe(false)
  })
})

describe("collectAssetIdsInUse", () => {
  test("reads the ids a project file references", () => {
    expect(
      collectAssetIdsInUse({ assets: [{ id: "a" }, { id: "b" }] })
    ).toEqual(new Set(["a", "b"]))
  })

  test("returns empty for a project file with no assets, and for null", () => {
    expect(collectAssetIdsInUse({ assets: [] }).size).toBe(0)
    expect(collectAssetIdsInUse(null).size).toBe(0)
  })
})

describe("toEditorAsset", () => {
  test("rebuilds a local asset around a fresh object url", () => {
    const asset = toEditorAsset(
      {
        blob: new Blob(["x"]),
        createdAt: 1_700_000_000_000,
        duration: 4,
        fileName: "clip.mp4",
        height: 1080,
        id: "asset-1",
        kind: "video",
        mimeType: "video/mp4",
        sizeBytes: 1234,
        width: 1920,
      },
      "blob:fresh"
    )

    expect(asset.url).toBe("blob:fresh")
    expect(asset.source).toBe("local")
    expect(asset.status).toBe("ready")
    expect(asset.error).toBeNull()
    expect(asset.fileName).toBe("clip.mp4")
    expect(asset.duration).toBe(4)
    expect(asset.width).toBe(1920)
    expect(asset.height).toBe(1080)
    expect(asset.mimeType).toBe("video/mp4")
    expect(asset.sizeBytes).toBe(1234)
    expect(asset.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })
})
