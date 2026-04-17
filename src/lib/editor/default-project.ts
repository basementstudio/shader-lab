import type { LabProjectFile } from "@/lib/editor/project-file"
import type { EditorLayer, Size, TimelineTrack } from "@/types/editor"
import defaultProjectJson from "./default-project.json"

function normalizeDefaultProjectFile(project: LabProjectFile): LabProjectFile {
  return {
    ...project,
    layers: project.layers.map((layer) => ({
      ...layer,
      expanded: typeof layer.expanded === "boolean" ? layer.expanded : true,
      parentGroupId:
        typeof layer.parentGroupId === "string" ? layer.parentGroupId : null,
    })) as EditorLayer[],
    version: 3,
  }
}

const DEFAULT_PROJECT = normalizeDefaultProjectFile(
  defaultProjectJson as unknown as LabProjectFile
)

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
