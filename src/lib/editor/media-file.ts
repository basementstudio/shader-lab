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
