import type { LabProjectFile } from "@/lib/editor/project-file"
import type { EditorLayer, Size, TimelineTrack } from "@/types/editor"
import defaultProjectJson from "./default-project.json"

const DEFAULT_PROJECT = defaultProjectJson as LabProjectFile

export function getDefaultProjectFile(): LabProjectFile {
  return structuredClone(DEFAULT_PROJECT)
}

export function getDefaultProjectComposition(): Size {
  return structuredClone(DEFAULT_PROJECT.composition)
}

export function getDefaultProjectLayers(): EditorLayer[] {
  return structuredClone(DEFAULT_PROJECT.layers)
}

export function getDefaultProjectSelectedLayerId(): string | null {
  return DEFAULT_PROJECT.selectedLayerId
}

export function getDefaultProjectTimeline(): {
  duration: number
  loop: boolean
  tracks: TimelineTrack[]
} {
  return structuredClone(DEFAULT_PROJECT.timeline)
}
