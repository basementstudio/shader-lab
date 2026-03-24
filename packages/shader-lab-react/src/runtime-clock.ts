import type { ShaderLabTimelineConfig } from "./types"

export interface ShaderLabRuntimeClock {
  delta: number
  duration: number
  loop: boolean
  time: number
}

const MIN_DURATION = 0.25

export function createRuntimeClock(
  timeline: Pick<ShaderLabTimelineConfig, "duration" | "loop">,
  time: number,
  delta: number,
): ShaderLabRuntimeClock {
  return {
    delta,
    duration: Math.max(timeline.duration, MIN_DURATION),
    loop: timeline.loop,
    time,
  }
}

export function advanceRuntimeClock(
  currentTime: number,
  timeline: Pick<ShaderLabTimelineConfig, "duration" | "loop">,
  delta: number,
): number {
  if (!Number.isFinite(delta) || delta <= 0) {
    return currentTime
  }

  const duration = Math.max(timeline.duration, MIN_DURATION)
  const nextTime = currentTime + delta

  if (timeline.loop) {
    return nextTime % duration
  }

  return Math.min(nextTime, duration)
}
