import type { AssetKind } from "@/types/editor"

export function inferFileAssetKind(file: File): AssetKind | null {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (mimeType.startsWith("image/")) {
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
