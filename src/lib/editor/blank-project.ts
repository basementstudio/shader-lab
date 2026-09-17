import { createDefaultAudioBands } from "@/lib/editor/audio/bands"
import type { LabProjectFile } from "@/lib/editor/project-file"
import { CURRENT_PROJECT_FILE_VERSION } from "@/lib/editor/project-version"
import { DEFAULT_SCENE_CONFIG, type EditorAudioSnapshot } from "@/types/editor"

export function getBlankProjectAudio(): EditorAudioSnapshot {
  return {
    bands: createDefaultAudioBands(),
    links: [],
    offsetSeconds: 0,
    source: null,
  }
}

/** Independent objects: editing a scene must never mutate future defaults. */
export function getBlankProjectFile(): LabProjectFile {
  return {
    assets: [],
    audio: getBlankProjectAudio(),
    composition: { width: 1920, height: 1080 },
    exportedAt: new Date().toISOString(),
    format: "shader-lab",
    layers: [],
    sceneConfig: structuredClone(DEFAULT_SCENE_CONFIG),
    selectedLayerId: null,
    timeline: { duration: 10, loop: true, tracks: [] },
    version: CURRENT_PROJECT_FILE_VERSION,
  }
}
