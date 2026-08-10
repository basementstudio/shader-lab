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

export interface Blob {
  active: boolean
  area: number
  cx: number
  cy: number
  halfHeight: number
  halfWidth: number
  history: BlobPoint[]
  id: number
  presence: number
}

export const STATIC_STEPS_BEFORE_FALLBACK = 30
export const MOTION_ENERGY_EPSILON = 0.01
export const TRACK_GRACE_FRAMES = 10
export const HISTORY_LENGTH = 16
export const MAX_MATCH_DISTANCE = 0.25
export const FADE_IN_FRAMES = 4

type Detection = {
  area: number
  cx: number
  cy: number
  halfHeight: number
  halfWidth: number
}

type TrackerState = {
  luminanceFallbackActive: boolean
  nextId: number
  staticStepCount: number
  tracks: Track[]
}

type Track = {
  active: boolean
  ageFrames: number
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

function trackPresence(track: Track): number {
  if (!track.active) {
    return clamp01(1 - track.missedFrames / TRACK_GRACE_FRAMES)
  }
  return clamp01((track.ageFrames + 1) / FADE_IN_FRAMES)
}

export class BlobTracker {
  private currentBlobs: Blob[] = []
  private lastSteppedTime: number | null = null
  private luminanceFallbackActive = false
  private nextId = 1
  private staticStepCount = 0
  private tracks: Track[] = []
  private priorState: TrackerState | null = null

  private binary = new Uint8Array(0)
  private visited = new Int32Array(0)
  private stack = new Int32Array(0)
  private visitGeneration = 0

  reset(): void {
    this.currentBlobs = []
    this.lastSteppedTime = null
    this.luminanceFallbackActive = false
    this.nextId = 1
    this.staticStepCount = 0
    this.tracks = []
    this.priorState = null
    this.visited.fill(0)
    this.visitGeneration = 0
  }

  getBlobs(): Blob[] {
    return this.currentBlobs
  }

  step(
    grid: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    time: number,
    config: TrackerConfig
  ): void {
    if (this.lastSteppedTime !== null && time === this.lastSteppedTime) {
      this.restoreState(this.priorState)
    } else {
      this.priorState = this.captureState()
      this.lastSteppedTime = time
    }

    const mode = this.resolveMode(grid, gridWidth, gridHeight, config)
    this.binarize(grid, gridWidth, gridHeight, mode, config)
    const detections = this.detect(gridWidth, gridHeight, config)

    this.currentBlobs = config.persistentTracking
      ? this.trackPersistent(detections, config)
      : this.trackStateless(detections)
  }

  private captureState(): TrackerState {
    return {
      luminanceFallbackActive: this.luminanceFallbackActive,
      nextId: this.nextId,
      staticStepCount: this.staticStepCount,
      tracks: this.tracks.map((track) => ({
        ...track,
        history: track.history.slice(),
      })),
    }
  }

  private restoreState(state: TrackerState | null): void {
    if (!state) {
      this.luminanceFallbackActive = false
      this.nextId = 1
      this.staticStepCount = 0
      this.tracks = []
      return
    }
    this.luminanceFallbackActive = state.luminanceFallbackActive
    this.nextId = state.nextId
    this.staticStepCount = state.staticStepCount
    this.tracks = state.tracks.map((track) => ({
      ...track,
      history: track.history.slice(),
    }))
  }

  private ensureBuffers(cellCount: number): void {
    if (this.binary.length === cellCount) {
      return
    }
    this.binary = new Uint8Array(cellCount)
    this.visited = new Int32Array(cellCount)
    this.stack = new Int32Array(cellCount)
    this.visitGeneration = 0
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
  ): void {
    const cellCount = gridWidth * gridHeight
    this.ensureBuffers(cellCount)

    const channelOffset = mode === "motion" ? 0 : 1
    const threshold =
      (mode === "motion" ? config.motionThreshold : config.sensitivity) * 255
    const binary = this.binary

    for (let index = 0; index < cellCount; index += 1) {
      const value = grid[index * 4 + channelOffset] ?? 0
      binary[index] = value >= threshold ? 1 : 0
    }
  }

  private detect(
    gridWidth: number,
    gridHeight: number,
    config: TrackerConfig
  ): Detection[] {
    const binary = this.binary
    const visited = this.visited
    const stack = this.stack
    const detections: Detection[] = []

    this.visitGeneration += 1
    const generation = this.visitGeneration

    for (let startY = 0; startY < gridHeight; startY += 1) {
      for (let startX = 0; startX < gridWidth; startX += 1) {
        const startIndex = startY * gridWidth + startX
        if (binary[startIndex] !== 1 || visited[startIndex] === generation) {
          continue
        }

        let area = 0
        let sumX = 0
        let sumY = 0
        let minX = startX
        let maxX = startX
        let minY = startY
        let maxY = startY

        visited[startIndex] = generation
        stack[0] = startIndex
        let stackSize = 1

        while (stackSize > 0) {
          stackSize -= 1
          const index = stack[stackSize] as number
          const x = index % gridWidth
          const y = (index - x) / gridWidth

          area += 1
          sumX += x
          sumY += y
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y

          if (x > 0) {
            const neighbor = index - 1
            if (binary[neighbor] === 1 && visited[neighbor] !== generation) {
              visited[neighbor] = generation
              stack[stackSize] = neighbor
              stackSize += 1
            }
          }
          if (x < gridWidth - 1) {
            const neighbor = index + 1
            if (binary[neighbor] === 1 && visited[neighbor] !== generation) {
              visited[neighbor] = generation
              stack[stackSize] = neighbor
              stackSize += 1
            }
          }
          if (y > 0) {
            const neighbor = index - gridWidth
            if (binary[neighbor] === 1 && visited[neighbor] !== generation) {
              visited[neighbor] = generation
              stack[stackSize] = neighbor
              stackSize += 1
            }
          }
          if (y < gridHeight - 1) {
            const neighbor = index + gridWidth
            if (binary[neighbor] === 1 && visited[neighbor] !== generation) {
              visited[neighbor] = generation
              stack[stackSize] = neighbor
              stackSize += 1
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
      presence: 1,
    }))
  }

  private trackPersistent(
    detections: Detection[],
    config: TrackerConfig
  ): Blob[] {
    const blend = 1 - clamp01(config.smoothing)
    const available = this.tracks.slice()
    const matchedTrackIds = new Set<number>()

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
        const reach = MAX_MATCH_DISTANCE * (1 + track.missedFrames)
        if (distance > reach * reach) {
          continue
        }
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
        bestTrack.ageFrames += 1
        bestTrack.history.push({ x: bestTrack.cx, y: bestTrack.cy })
        if (bestTrack.history.length > HISTORY_LENGTH) {
          bestTrack.history.shift()
        }
      } else {
        this.tracks.push({
          active: true,
          ageFrames: 0,
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
      presence: trackPresence(track),
    }))
  }
}
