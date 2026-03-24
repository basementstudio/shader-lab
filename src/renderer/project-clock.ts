import type { ProjectClock } from "@/renderer/contracts"
import type { TimelineStateSnapshot } from "@/types/editor"

export type TimelineClockState = Pick<
  TimelineStateSnapshot,
  "currentTime" | "duration" | "isPlaying" | "loop"
>

const MIN_DURATION = 0.25

export function createProjectClock(
  timeline: TimelineClockState,
  delta: number,
  explicitTime?: number,
): ProjectClock {
  return {
    delta,
    duration: timeline.duration,
    isPlaying: timeline.isPlaying,
    loop: timeline.loop,
    time: typeof explicitTime === "number" ? explicitTime : timeline.currentTime,
  }
}

export function advanceProjectTimeline(
  timeline: TimelineClockState,
  delta: number,
): Pick<TimelineClockState, "currentTime" | "isPlaying"> {
  if (!Number.isFinite(delta) || delta <= 0 || !timeline.isPlaying) {
    return {
      currentTime: timeline.currentTime,
      isPlaying: timeline.isPlaying,
    }
  }

  const duration = Math.max(timeline.duration, MIN_DURATION)
  const nextTime = timeline.currentTime + delta

  if (timeline.loop) {
    return {
      currentTime: nextTime % duration,
      isPlaying: timeline.isPlaying,
    }
  }

  if (nextTime >= duration) {
    return {
      currentTime: duration,
      isPlaying: false,
    }
  }

  return {
    currentTime: nextTime,
    isPlaying: true,
  }
}
