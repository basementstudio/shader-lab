"use client"

import { useTimelineStore } from "@/store/timeline-store"
import type { FluidInteractionEvent } from "@/types/editor"

let recordingLayerId: string | null = null
let events: FluidInteractionEvent[] = []

export function startFluidInteractionRecording(layerId: string): void {
  recordingLayerId = layerId
  events = []
}

export function stopFluidInteractionRecording(): FluidInteractionEvent[] {
  const recordedEvents = events
  recordingLayerId = null
  events = []
  return recordedEvents
}

export function cancelFluidInteractionRecording(): void {
  recordingLayerId = null
  events = []
}

export function getFluidInteractionRecordingLayerId(): string | null {
  return recordingLayerId
}

export function recordFluidInteractionEvent(
  layerId: string,
  event: Omit<FluidInteractionEvent, "time">
): void {
  if (recordingLayerId !== layerId) {
    return
  }

  const time = useTimelineStore.getState().currentTime

  events.push({
    ...event,
    time,
  })
}
