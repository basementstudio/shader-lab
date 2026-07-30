import type { AssetKind } from "@/types/editor"

export function isSvgFileName(fileName: string | null | undefined): boolean {
  return fileName?.toLowerCase().endsWith(".svg") ?? false
}

export function isSvgMediaSource(input: {
  fileName?: string | null
  mimeType?: string | null
}): boolean {
  return (
    input.mimeType?.toLowerCase() === "image/svg+xml" ||
    isSvgFileName(input.fileName)
  )
}

/** Extensions whose MIME type browsers report inconsistently or not at all. */
export const AUDIO_FILE_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
] as const

/** `accept` attribute value for audio file inputs. */
export const AUDIO_FILE_ACCEPT = `audio/*,${AUDIO_FILE_EXTENSIONS.join(",")}`

export function isAudioFileName(fileName: string | null | undefined): boolean {
  const lower = fileName?.toLowerCase()

  if (!lower) {
    return false
  }

  return AUDIO_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function inferFileAssetKind(file: File): AssetKind | null {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (mimeType.startsWith("image/") || isSvgFileName(fileName)) {
    return "image"
  }

  if (mimeType.startsWith("video/")) {
    return "video"
  }

  if (fileName.endsWith(".mov")) {
    return "video"
  }

  // Checked after video so `video/*` containers still resolve as video, and
  // before the model checks since neither set overlaps.
  if (mimeType.startsWith("audio/") || isAudioFileName(fileName)) {
    return "audio"
  }

  if (
    fileName.endsWith(".glb") ||
    fileName.endsWith(".gltf") ||
    fileName.endsWith(".obj") ||
    mimeType === "model/gltf-binary" ||
    mimeType === "model/gltf+json" ||
    mimeType === "model/obj"
  ) {
    return "model"
  }

  return null
}
