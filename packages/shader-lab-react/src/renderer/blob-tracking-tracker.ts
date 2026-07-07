/**
 * Blob tracker — pure TypeScript, zero DOM/three imports so it runs under
 * `bun test` and can be mirrored into the published package unchanged.
 *
 * It consumes a small analysis grid produced on the GPU and read back to the
 * CPU: an interleaved RGBA `Uint8Array` where, per texel,
 *   - R = motion energy (|luma(current) − luma(previous)|), and
 *   - G = luminance of the current frame.
 * From that it produces a stable set of tracked blobs (bounding boxes +
 * centroids) for the compositor to draw shapes and decorations around.
 *
 * Temporal rules (mirrors `pixel-trail-pass` determinism precedent):
 *   - `step()` advances state at most once per distinct `time` — the export
 *     prewarm renders the same timestamp repeatedly and must not double-step.
 *   - `reset()` clears everything, called when the timeline scrubs backwards.
 */

export type DetectionMode = "auto" | "motion" | "luminance"

export interface TrackerConfig {
  blobAmount: number
  detectionMode: DetectionMode
  minBlobSize: number
  motionThreshold: number
  persistentTracking: boolean
  sensitivity: number
  smoothing: number
}

export interface BlobPoint {
  x: number
  y: number
}

/** A tracked blob in normalized (0..1) grid coordinates. */
export interface Blob {
  active: boolean
  area: number
  cx: number
  cy: number
  halfHeight: number
  halfWidth: number
  history: BlobPoint[]
  id: number
}

/** Number of consecutive static steps before `auto` falls back to luminance. */
export const STATIC_STEPS_BEFORE_FALLBACK = 30
/** Mean motion energy (0..1) below which a step counts as "static". */
export const MOTION_ENERGY_EPSILON = 0.01
/** Frames a persistent track survives unmatched before it despawns. */
export const TRACK_GRACE_FRAMES = 10
/** Position-history ring length used for trails. */
export const HISTORY_LENGTH = 16

type Detection = {
  area: number
  cx: number
  cy: number
  halfHeight: number
  halfWidth: number
}

type Track = {
  active: boolean
  area: number
  cx: number
  cy: number
  halfHeight: number
  halfWidth: number
  history: BlobPoint[]
  id: number
  missedFrames: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export class BlobTracker {
  private currentBlobs: Blob[] = []
  private lastSteppedTime: number | null = null
  private luminanceFallbackActive = false
  private nextId = 1
  private staticStepCount = 0
  private tracks: Track[] = []

  reset(): void {
    this.currentBlobs = []
    this.lastSteppedTime = null
    this.luminanceFallbackActive = false
    this.nextId = 1
    this.staticStepCount = 0
    this.tracks = []
  }

  getBlobs(): Blob[] {
    return this.currentBlobs
  }

  /**
   * Advance the tracker for `time`. No-ops when `time` equals the previous
   * stepped time (idempotent per distinct timestamp).
   */
  step(
    grid: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    time: number,
    config: TrackerConfig
  ): void {
    if (this.lastSteppedTime !== null && time === this.lastSteppedTime) {
      return
    }
    this.lastSteppedTime = time

    const mode = this.resolveMode(grid, gridWidth, gridHeight, config)
    const binary = this.binarize(grid, gridWidth, gridHeight, mode, config)
    const detections = this.detect(binary, gridWidth, gridHeight, config)

    this.currentBlobs = config.persistentTracking
      ? this.trackPersistent(detections, config)
      : this.trackStateless(detections)
  }

  private resolveMode(
    grid: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    config: TrackerConfig
  ): "luminance" | "motion" {
    if (config.detectionMode !== "auto") {
      return config.detectionMode
    }

    const cellCount = gridWidth * gridHeight
    let motionSum = 0
    for (let index = 0; index < cellCount; index += 1) {
      motionSum += (grid[index * 4] ?? 0) / 255
    }
    const meanMotion = cellCount > 0 ? motionSum / cellCount : 0

    if (meanMotion < MOTION_ENERGY_EPSILON) {
      this.staticStepCount += 1
      if (this.staticStepCount >= STATIC_STEPS_BEFORE_FALLBACK) {
        this.luminanceFallbackActive = true
      }
    } else {
      this.staticStepCount = 0
      this.luminanceFallbackActive = false
    }

    return this.luminanceFallbackActive ? "luminance" : "motion"
  }

  private binarize(
    grid: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    mode: "luminance" | "motion",
    config: TrackerConfig
  ): Uint8Array {
    const channelOffset = mode === "motion" ? 0 : 1
    const threshold =
      (mode === "motion" ? config.motionThreshold : config.sensitivity) * 255
    const cellCount = gridWidth * gridHeight
    const binary = new Uint8Array(cellCount)

    for (let index = 0; index < cellCount; index += 1) {
      const value = grid[index * 4 + channelOffset] ?? 0
      binary[index] = value >= threshold ? 1 : 0
    }

    return binary
  }

  private detect(
    binary: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    config: TrackerConfig
  ): Detection[] {
    const labels = new Int32Array(binary.length).fill(-1)
    const detections: Detection[] = []
    const stack: number[] = []

    for (let startY = 0; startY < gridHeight; startY += 1) {
      for (let startX = 0; startX < gridWidth; startX += 1) {
        const startIndex = startY * gridWidth + startX
        if (binary[startIndex] !== 1 || labels[startIndex] !== -1) {
          continue
        }

        // Flood-fill this 4-connected component.
        let area = 0
        let sumX = 0
        let sumY = 0
        let minX = startX
        let maxX = startX
        let minY = startY
        let maxY = startY

        labels[startIndex] = detections.length
        stack.push(startIndex)

        while (stack.length > 0) {
          const index = stack.pop() as number
          const x = index % gridWidth
          const y = (index - x) / gridWidth

          area += 1
          sumX += x
          sumY += y
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)

          const neighbors = [
            x > 0 ? index - 1 : -1,
            x < gridWidth - 1 ? index + 1 : -1,
            y > 0 ? index - gridWidth : -1,
            y < gridHeight - 1 ? index + gridWidth : -1,
          ]
          for (const neighbor of neighbors) {
            if (
              neighbor >= 0 &&
              binary[neighbor] === 1 &&
              labels[neighbor] === -1
            ) {
              labels[neighbor] = detections.length
              stack.push(neighbor)
            }
          }
        }

        if (area < config.minBlobSize) {
          continue
        }

        const boxWidth = maxX - minX + 1
        const boxHeight = maxY - minY + 1
        detections.push({
          area,
          cx: clamp01((sumX / area + 0.5) / gridWidth),
          cy: clamp01((sumY / area + 0.5) / gridHeight),
          halfHeight: boxHeight / 2 / gridHeight,
          halfWidth: boxWidth / 2 / gridWidth,
        })
      }
    }

    detections.sort((left, right) => right.area - left.area)
    const limit = Math.max(0, Math.floor(config.blobAmount))
    return detections.slice(0, limit)
  }

  private trackStateless(detections: Detection[]): Blob[] {
    this.tracks = []
    return detections.map((detection, index) => ({
      active: true,
      area: detection.area,
      cx: detection.cx,
      cy: detection.cy,
      halfHeight: detection.halfHeight,
      halfWidth: detection.halfWidth,
      history: [{ x: detection.cx, y: detection.cy }],
      id: index,
    }))
  }

  private trackPersistent(
    detections: Detection[],
    config: TrackerConfig
  ): Blob[] {
    const blend = 1 - clamp01(config.smoothing)
    const available = this.tracks.slice()
    const matchedTrackIds = new Set<number>()

    // Greedy nearest-neighbor matching: each detection claims the closest
    // still-unmatched track.
    for (const detection of detections) {
      let bestTrack: Track | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (const track of available) {
        if (matchedTrackIds.has(track.id)) {
          continue
        }
        const dx = track.cx - detection.cx
        const dy = track.cy - detection.cy
        const distance = dx * dx + dy * dy
        if (distance < bestDistance) {
          bestDistance = distance
          bestTrack = track
        }
      }

      if (bestTrack) {
        matchedTrackIds.add(bestTrack.id)
        bestTrack.cx += (detection.cx - bestTrack.cx) * blend
        bestTrack.cy += (detection.cy - bestTrack.cy) * blend
        bestTrack.halfWidth +=
          (detection.halfWidth - bestTrack.halfWidth) * blend
        bestTrack.halfHeight +=
          (detection.halfHeight - bestTrack.halfHeight) * blend
        bestTrack.area = detection.area
        bestTrack.active = true
        bestTrack.missedFrames = 0
        bestTrack.history.push({ x: bestTrack.cx, y: bestTrack.cy })
        if (bestTrack.history.length > HISTORY_LENGTH) {
          bestTrack.history.shift()
        }
      } else {
        this.tracks.push({
          active: true,
          area: detection.area,
          cx: detection.cx,
          cy: detection.cy,
          halfHeight: detection.halfHeight,
          halfWidth: detection.halfWidth,
          history: [{ x: detection.cx, y: detection.cy }],
          id: this.nextId,
          missedFrames: 0,
        })
        matchedTrackIds.add(this.nextId)
        this.nextId += 1
      }
    }

    // Age unmatched tracks; despawn past the grace window.
    const survivors: Track[] = []
    for (const track of this.tracks) {
      if (matchedTrackIds.has(track.id)) {
        survivors.push(track)
        continue
      }
      track.missedFrames += 1
      track.active = false
      if (track.missedFrames <= TRACK_GRACE_FRAMES) {
        survivors.push(track)
      }
    }
    this.tracks = survivors

    return this.tracks.map((track) => ({
      active: track.active,
      area: track.area,
      cx: track.cx,
      cy: track.cy,
      halfHeight: track.halfHeight,
      halfWidth: track.halfWidth,
      history: track.history.slice(),
      id: track.id,
    }))
  }
}
