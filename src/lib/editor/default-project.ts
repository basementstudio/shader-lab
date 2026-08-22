import type { LabProjectFile } from "@/lib/editor/project-file"
import { createRemoteAsset } from "@/lib/editor/remote-asset"
import type {
  EditorAsset,
  EditorAudioSnapshot,
  EditorLayer,
  SceneConfig,
  Size,
  TimelineTrack,
} from "@/types/editor"
import defaultProjectJson from "./default-project.json"

const DEFAULT_PROJECT = defaultProjectJson as LabProjectFile

const DEFAULT_PROJECT_ASSETS = DEFAULT_PROJECT.assets
  .map((reference) => createRemoteAsset(reference))
  .filter((asset): asset is EditorAsset => asset !== null)

if (DEFAULT_PROJECT_ASSETS.length !== DEFAULT_PROJECT.assets.length) {
  throw new Error("The default project references media it cannot resolve.")
}

function readDefaultProjectSceneConfig(): SceneConfig {
  const sceneConfig = DEFAULT_PROJECT.sceneConfig

  if (!sceneConfig) {
    throw new Error("The default project is missing its scene config.")
  }

  return sceneConfig
}

const DEFAULT_PROJECT_SCENE_CONFIG = readDefaultProjectSceneConfig()

function readDefaultProjectAudio(): EditorAudioSnapshot {
  const audio = DEFAULT_PROJECT.audio

  if (!audio) {
    throw new Error("The default project is missing its audio snapshot.")
  }

  return audio
}

const DEFAULT_PROJECT_AUDIO = readDefaultProjectAudio()

export function getDefaultProjectFile(): LabProjectFile {
  return structuredClone(DEFAULT_PROJECT)
}

export function getDefaultProjectAssets(): EditorAsset[] {
  return structuredClone(DEFAULT_PROJECT_ASSETS)
}

export function getDefaultProjectAudio(): EditorAudioSnapshot {
  return structuredClone(DEFAULT_PROJECT_AUDIO)
}

export function getDefaultProjectComposition(): Size {
  return structuredClone(DEFAULT_PROJECT.composition)
}

export function getDefaultProjectLayers(): EditorLayer[] {
  return structuredClone(DEFAULT_PROJECT.layers)
}

export function getDefaultProjectSceneConfig(): SceneConfig {
  return structuredClone(DEFAULT_PROJECT_SCENE_CONFIG)
}

export function getDefaultProjectSelectedLayerId(): string | null {
  return DEFAULT_PROJECT.selectedLayerId
}

/** Bundled media the first frame waits on. Audio is deferred, so excluded. */
export function getDefaultProjectPreloadUrls(): string[] {
  const layerAssetIds = new Set(
    DEFAULT_PROJECT.layers
      .map((layer) => layer.assetId)
      .filter((assetId): assetId is string => assetId !== null)
  )

  return DEFAULT_PROJECT_ASSETS.filter(
    (asset) =>
      layerAssetIds.has(asset.id) &&
      (asset.kind === "image" || asset.kind === "video")
  ).map((asset) => asset.url)
}

export function getDefaultProjectTimeline(): {
  duration: number
  loop: boolean
  tracks: TimelineTrack[]
} {
  return structuredClone(DEFAULT_PROJECT.timeline)
}
