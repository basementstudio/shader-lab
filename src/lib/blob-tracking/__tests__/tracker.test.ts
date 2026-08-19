import { describe, expect, test } from "bun:test"
import {
  BlobTracker,
  FADE_IN_FRAMES,
  STATIC_STEPS_BEFORE_FALLBACK,
  type TrackerConfig,
  TRACK_GRACE_FRAMES,
} from "@/lib/blob-tracking/tracker"

type Cell = { energy?: number; luma?: number; motion?: number }

/**
 * Mirrors the analysis pass output. `energy` defaults to `motion` because the
 * GPU writes `max(decayedEnergy, motion)`, so a cell seeing fresh motion always
 * carries at least that much energy.
 */
function makeGrid(
  width: number,
  height: number,
  cell: (x: number, y: number) => Cell
): Uint8Array {
  const grid = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { luma = 0, motion = 0, energy } = cell(x, y)
      const index = (y * width + x) * 4
      grid[index] = motion
      grid[index + 1] = luma
      grid[index + 2] = energy ?? motion
      grid[index + 3] = 255
    }
  }
  return grid
}

function lumaBlock(
  width: number,
  height: number,
  blocks: { luma?: number; x0: number; x1: number; y0: number; y1: number }[]
): Uint8Array {
  return makeGrid(width, height, (x, y) => {
    for (const block of blocks) {
      if (x >= block.x0 && x <= block.x1 && y >= block.y0 && y <= block.y1) {
        return { luma: block.luma ?? 255 }
      }
    }
    return {}
  })
}

function config(overrides: Partial<TrackerConfig> = {}): TrackerConfig {
  return {
    blobAmount: 32,
    detectionMode: "luminance",
    minBlobSize: 1,
    motionThreshold: 0.2,
    persistentTracking: false,
    sensitivity: 0.5,
    smoothing: 0,
    ...overrides,
  }
}

describe("BlobTracker detection", () => {
  test("clusters a single connected component", () => {
    const grid = lumaBlock(8, 8, [{ x0: 2, x1: 3, y0: 2, y1: 3 }])
    const tracker = new BlobTracker()

    tracker.step(grid, 8, 8, 0, config())
    const blobs = tracker.getBlobs()

    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.area).toBe(4)
    expect(blobs[0]?.cx).toBeCloseTo((2.5 + 0.5) / 8, 5)
    expect(blobs[0]?.cy).toBeCloseTo((2.5 + 0.5) / 8, 5)
  })

  test("detects on decayed energy after instantaneous motion stops", () => {
    const held = makeGrid(8, 8, (x, y) =>
      x >= 2 && x <= 3 && y >= 2 && y <= 3 ? { energy: 200, motion: 0 } : {}
    )
    const tracker = new BlobTracker()

    tracker.step(held, 8, 8, 0, config({ detectionMode: "motion" }))

    expect(tracker.getBlobs()).toHaveLength(1)
    expect(tracker.getBlobs()[0]?.area).toBe(4)
  })

  test("ignores instantaneous motion that carries no energy", () => {
    const stale = makeGrid(8, 8, (x, y) =>
      x >= 2 && x <= 3 && y >= 2 && y <= 3 ? { energy: 0, motion: 255 } : {}
    )
    const tracker = new BlobTracker()

    tracker.step(stale, 8, 8, 0, config({ detectionMode: "motion" }))

    expect(tracker.getBlobs()).toHaveLength(0)
  })

  test("higher sensitivity detects dimmer content", () => {
    const dim = lumaBlock(8, 8, [{ luma: 60, x0: 2, x1: 3, y0: 2, y1: 3 }])

    const shy = new BlobTracker()
    shy.step(dim, 8, 8, 0, config({ sensitivity: 0.5 }))
    expect(shy.getBlobs()).toHaveLength(0)

    const keen = new BlobTracker()
    keen.step(dim, 8, 8, 0, config({ sensitivity: 0.9 }))
    expect(keen.getBlobs()).toHaveLength(1)
  })

  test("does not merge separated components", () => {
    const grid = lumaBlock(8, 8, [
      { x0: 0, x1: 1, y0: 0, y1: 1 },
      { x0: 5, x1: 6, y0: 5, y1: 6 },
    ])
    const tracker = new BlobTracker()

    tracker.step(grid, 8, 8, 0, config())

    expect(tracker.getBlobs()).toHaveLength(2)
  })

  test("drops components smaller than minBlobSize", () => {
    const grid = lumaBlock(8, 8, [
      { x0: 0, x1: 0, y0: 0, y1: 0 }, // area 1
      { x0: 4, x1: 5, y0: 4, y1: 5 }, // area 4
    ])
    const tracker = new BlobTracker()

    tracker.step(grid, 8, 8, 0, config({ minBlobSize: 2 }))
    expect(tracker.getBlobs()).toHaveLength(1)
    expect(tracker.getBlobs()[0]?.area).toBe(4)

    tracker.reset()
    tracker.step(grid, 8, 8, 0, config({ minBlobSize: 1 }))
    expect(tracker.getBlobs()).toHaveLength(2)
  })

  test("keeps only the top-N components by area", () => {
    const grid = lumaBlock(10, 10, [
      { x0: 0, x1: 0, y0: 0, y1: 0 }, // area 1
      { x0: 3, x1: 4, y0: 3, y1: 4 }, // area 4
      { x0: 6, x1: 8, y0: 6, y1: 8 }, // area 9
    ])
    const tracker = new BlobTracker()

    tracker.step(grid, 10, 10, 0, config({ blobAmount: 2 }))
    const areas = tracker
      .getBlobs()
      .map((blob) => blob.area)
      .sort((left, right) => right - left)

    expect(areas).toEqual([9, 4])
  })
})

describe("BlobTracker persistent tracking", () => {
  test("keeps a stable id across a motion sequence", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })

    tracker.step(lumaBlock(16, 16, [{ x0: 2, x1: 3, y0: 2, y1: 3 }]), 16, 16, 0, cfg)
    const firstId = tracker.getBlobs()[0]?.id
    expect(firstId).toBeDefined()

    tracker.step(lumaBlock(16, 16, [{ x0: 3, x1: 4, y0: 3, y1: 4 }]), 16, 16, 1, cfg)
    tracker.step(lumaBlock(16, 16, [{ x0: 4, x1: 5, y0: 4, y1: 5 }]), 16, 16, 2, cfg)

    expect(tracker.getBlobs()).toHaveLength(1)
    expect(tracker.getBlobs()[0]?.id).toBe(firstId as number)
  })

  test("despawns an unmatched track after the grace window", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })
    const empty = makeGrid(16, 16, () => ({}))

    tracker.step(lumaBlock(16, 16, [{ x0: 2, x1: 3, y0: 2, y1: 3 }]), 16, 16, 0, cfg)
    expect(tracker.getBlobs()).toHaveLength(1)

    for (let frame = 1; frame <= TRACK_GRACE_FRAMES; frame += 1) {
      tracker.step(empty, 16, 16, frame, cfg)
    }
    expect(tracker.getBlobs()).toHaveLength(1)
    expect(tracker.getBlobs()[0]?.active).toBe(false)

    tracker.step(empty, 16, 16, TRACK_GRACE_FRAMES + 1, cfg)
    expect(tracker.getBlobs()).toHaveLength(0)
  })

  test("EMA smoothing converges toward the detection", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true, smoothing: 0.5 })

    // Establish a track on the left.
    tracker.step(lumaBlock(20, 20, [{ x0: 1, x1: 2, y0: 9, y1: 10 }]), 20, 20, 0, cfg)
    const start = tracker.getBlobs()[0]?.cx as number

    const target = lumaBlock(20, 20, [{ x0: 5, x1: 6, y0: 9, y1: 10 }])
    tracker.step(target, 20, 20, 1, cfg)
    const afterOne = tracker.getBlobs()[0]?.cx as number

    for (let frame = 2; frame < 20; frame += 1) {
      tracker.step(target, 20, 20, frame, cfg)
    }
    const converged = tracker.getBlobs()[0]?.cx as number
    const targetCx = (5.5 + 0.5) / 20

    expect(afterOne).toBeGreaterThan(start)
    expect(afterOne).toBeLessThan(targetCx)
    expect(converged).toBeCloseTo(targetCx, 3)
  })

  test("a detection beyond the match radius spawns a new track", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true, smoothing: 0 })

    tracker.step(lumaBlock(20, 20, [{ x0: 1, x1: 2, y0: 9, y1: 10 }]), 20, 20, 0, cfg)
    const firstId = tracker.getBlobs()[0]?.id as number
    expect(firstId).toBeDefined()

    tracker.step(
      lumaBlock(20, 20, [{ x0: 16, x1: 17, y0: 9, y1: 10 }]),
      20,
      20,
      1,
      cfg
    )

    const blobs = tracker.getBlobs()
    const active = blobs.filter((blob) => blob.active)
    expect(active).toHaveLength(1)
    expect(active[0]?.id).not.toBe(firstId)

    const stale = blobs.find((blob) => blob.id === firstId)
    expect(stale?.active).toBe(false)
  })

  test("the match radius widens while a track is missing", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true, smoothing: 0 })
    const empty = makeGrid(20, 20, () => ({}))

    tracker.step(lumaBlock(20, 20, [{ x0: 1, x1: 2, y0: 9, y1: 10 }]), 20, 20, 0, cfg)
    const firstId = tracker.getBlobs()[0]?.id as number

    for (let frame = 1; frame <= 3; frame += 1) {
      tracker.step(empty, 20, 20, frame, cfg)
    }
    tracker.step(
      lumaBlock(20, 20, [{ x0: 12, x1: 13, y0: 9, y1: 10 }]),
      20,
      20,
      4,
      cfg
    )

    const active = tracker.getBlobs().filter((blob) => blob.active)
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(firstId)
  })
})

describe("BlobTracker temporal guards", () => {
  test("advances state at most once per distinct time", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })
    const grid = lumaBlock(16, 16, [{ x0: 2, x1: 3, y0: 2, y1: 3 }])

    tracker.step(grid, 16, 16, 5, cfg)
    tracker.step(grid, 16, 16, 5, cfg) // same time — must no-op
    expect(tracker.getBlobs()[0]?.history).toHaveLength(1)

    tracker.step(grid, 16, 16, 6, cfg)
    expect(tracker.getBlobs()[0]?.history).toHaveLength(2)
  })

  test("a repeated timestamp re-runs on the newer grid instead of skipping", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })
    const cold = makeGrid(16, 16, () => ({}))
    const warm = lumaBlock(16, 16, [{ x0: 2, x1: 5, y0: 2, y1: 5 }])

    tracker.step(cold, 16, 16, 3, cfg)
    expect(tracker.getBlobs()).toHaveLength(0)

    tracker.step(warm, 16, 16, 3, cfg)
    expect(tracker.getBlobs()).toHaveLength(1)
    expect(tracker.getBlobs()[0]?.history).toHaveLength(1)
  })

  test("re-running a timestamp does not double-advance track state", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true, smoothing: 0.5 })
    const first = lumaBlock(20, 20, [{ x0: 2, x1: 3, y0: 9, y1: 10 }])
    const second = lumaBlock(20, 20, [{ x0: 4, x1: 5, y0: 9, y1: 10 }])

    tracker.step(first, 20, 20, 0, cfg)
    tracker.step(second, 20, 20, 1, cfg)
    const once = tracker.getBlobs()[0]

    const repeated = new BlobTracker()
    repeated.step(first, 20, 20, 0, cfg)
    repeated.step(second, 20, 20, 1, cfg)
    repeated.step(second, 20, 20, 1, cfg)
    repeated.step(second, 20, 20, 1, cfg)
    const thrice = repeated.getBlobs()[0]

    expect(thrice?.id).toBe(once?.id as number)
    expect(thrice?.cx).toBeCloseTo(once?.cx as number, 10)
    expect(thrice?.history).toHaveLength(once?.history.length as number)
  })

  test("presence ramps in on spawn and out across the grace window", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })
    const grid = lumaBlock(16, 16, [{ x0: 2, x1: 3, y0: 2, y1: 3 }])
    const empty = makeGrid(16, 16, () => ({}))

    tracker.step(grid, 16, 16, 0, cfg)
    const spawned = tracker.getBlobs()[0]?.presence as number
    expect(spawned).toBeGreaterThan(0)
    expect(spawned).toBeLessThan(1)

    for (let frame = 1; frame < FADE_IN_FRAMES; frame += 1) {
      tracker.step(grid, 16, 16, frame, cfg)
    }
    expect(tracker.getBlobs()[0]?.presence).toBe(1)

    tracker.step(empty, 16, 16, FADE_IN_FRAMES, cfg)
    const firstMiss = tracker.getBlobs()[0]?.presence as number
    tracker.step(empty, 16, 16, FADE_IN_FRAMES + 1, cfg)
    const secondMiss = tracker.getBlobs()[0]?.presence as number

    expect(firstMiss).toBeLessThan(1)
    expect(firstMiss).toBeGreaterThan(0)
    expect(secondMiss).toBeLessThan(firstMiss)
  })

  test("reset clears blobs and restarts ids", () => {
    const tracker = new BlobTracker()
    const cfg = config({ persistentTracking: true })
    const grid = lumaBlock(16, 16, [{ x0: 2, x1: 3, y0: 2, y1: 3 }])

    tracker.step(grid, 16, 16, 0, cfg)
    const firstId = tracker.getBlobs()[0]?.id as number

    tracker.reset()
    expect(tracker.getBlobs()).toHaveLength(0)

    tracker.step(grid, 16, 16, 0, cfg)
    expect(tracker.getBlobs()[0]?.id).toBe(firstId)
  })
})

describe("BlobTracker auto detection mode", () => {
  test("falls back to luminance after sustained static frames and re-arms on motion", () => {
    const tracker = new BlobTracker()
    const cfg = config({ detectionMode: "auto" })
    // Static frame: no motion energy, but a luminance blob is present.
    const staticGrid = makeGrid(16, 16, (x, y) => {
      const inBlock = x >= 2 && x <= 4 && y >= 2 && y <= 4
      return inBlock ? { luma: 255 } : {}
    })

    // Before the fallback threshold: motion mode sees no motion → no blobs.
    for (let frame = 0; frame < STATIC_STEPS_BEFORE_FALLBACK - 1; frame += 1) {
      tracker.step(staticGrid, 16, 16, frame, cfg)
    }
    expect(tracker.getBlobs()).toHaveLength(0)

    // The threshold step trips the luminance fallback → the blob appears.
    tracker.step(staticGrid, 16, 16, STATIC_STEPS_BEFORE_FALLBACK - 1, cfg)
    expect(tracker.getBlobs().length).toBeGreaterThan(0)

    // A frame with motion re-arms motion mode and is detected there.
    const motionGrid = makeGrid(16, 16, (x, y) => {
      const inBlock = x >= 8 && x <= 10 && y >= 8 && y <= 10
      return inBlock ? { motion: 255 } : {}
    })
    tracker.step(motionGrid, 16, 16, STATIC_STEPS_BEFORE_FALLBACK, cfg)
    expect(tracker.getBlobs().length).toBeGreaterThan(0)

    // Proof it re-armed to motion: a luminance-only frame now yields nothing.
    tracker.step(staticGrid, 16, 16, STATIC_STEPS_BEFORE_FALLBACK + 1, cfg)
    expect(tracker.getBlobs()).toHaveLength(0)
  })
})

describe("BlobTracker velocity", () => {
  const GRID = 32

  function movingGrid(x0: number): Uint8Array {
    return lumaBlock(GRID, 16, [{ x0, x1: x0 + 1, y0: 7, y1: 8 }])
  }

  test("estimates velocity from a steady drift", () => {
    const tracker = new BlobTracker()
    const settings = config({ persistentTracking: true, smoothing: 0 })

    // The estimate is an EMA, so give it enough steps to converge.
    for (let step = 0; step < 16; step += 1) {
      tracker.step(movingGrid(2 + step), GRID, 16, step, settings)
    }

    const blob = tracker.getBlobs()[0]
    expect(blob?.vx).toBeGreaterThan(0)
    // One cell per step across a 32-wide grid.
    expect(blob?.vx).toBeCloseTo(1 / GRID, 3)
    expect(blob?.vy).toBeCloseTo(0, 4)
  })

  test("a stationary blob has no velocity", () => {
    const tracker = new BlobTracker()
    const settings = config({ persistentTracking: true, smoothing: 0 })

    for (let step = 0; step < 5; step += 1) {
      tracker.step(movingGrid(4), GRID, 16, step, settings)
    }

    expect(tracker.getBlobs()[0]?.vx).toBeCloseTo(0, 4)
  })

  test("crossing blobs keep their ids", () => {
    const tracker = new BlobTracker()
    const settings = config({ persistentTracking: true, smoothing: 0 })

    // Two blobs approach, meet, and pass through each other.
    for (let step = 0; step < 10; step += 1) {
      const left = 2 + step
      const right = 12 - step
      tracker.step(
        lumaBlock(24, 16, [
          { x0: left, x1: left, y0: 7, y1: 7 },
          { x0: right, x1: right, y0: 7, y1: 7 },
        ]),
        24,
        16,
        step,
        settings
      )
    }

    const active = tracker.getBlobs().filter((blob) => blob.active)
    expect(active.map((blob) => blob.id).sort((a, b) => a - b)).toEqual([1, 2])

    // Id 1 started on the left and travelled right, so after crossing it must
    // be the right-hand blob. If the two swapped identities this inverts.
    const first = active.find((blob) => blob.id === 1)
    const second = active.find((blob) => blob.id === 2)
    expect(first?.cx).toBeGreaterThan(second?.cx as number)
  })
})
