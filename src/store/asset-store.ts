import { create } from "zustand"
import type { AssetKind, EditorAsset } from "@/types/editor"

export interface AssetStoreState {
  assets: EditorAsset[]
}

export interface AssetStoreActions {
  getAssetById: (id: string) => EditorAsset | null
  loadAsset: (file: File) => Promise<EditorAsset>
  removeAsset: (id: string) => void
  replaceAssets: (assets: EditorAsset[]) => void
}

export type AssetStore = AssetStoreState & AssetStoreActions

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "application/octet-stream",
])

const MAX_SIZE_BYTES = 100 * 1024 * 1024

function inferAssetKind(file: File): AssetKind | null {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (mimeType.startsWith("image/")) {
    return "image"
  }

  if (mimeType.startsWith("video/")) {
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

function validateFile(file: File): AssetKind {
  const kind = inferAssetKind(file)

  if (!kind || (!ACCEPTED_TYPES.has(file.type) && kind !== "model")) {
    throw new Error(
      `Unsupported file type "${file.type || "unknown"}". Accepted: PNG, JPG, WebP, GIF, MP4, WebM, GLB, GLTF, OBJ.`,
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 100 MB.`,
    )
  }

  return kind
}

function loadImageMetadata(url: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        height: image.naturalHeight,
        width: image.naturalWidth,
      })
    }

    image.onerror = () => {
      reject(new Error("Failed to read image metadata."))
    }

    image.src = url
  })
}

function loadVideoMetadata(
  url: string,
): Promise<{ duration: number; height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        height: video.videoHeight,
        width: video.videoWidth,
      })
    }

    video.onerror = () => {
      reject(new Error("Failed to read video metadata."))
    }

    video.src = url
  })
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: [],

  async loadAsset(file) {
    const kind = validateFile(file)
    const url = URL.createObjectURL(file)
    const baseAsset = {
      createdAt: new Date().toISOString(),
      error: null,
      fileName: file.name,
      id: crypto.randomUUID(),
      kind,
      mimeType: file.type,
      sizeBytes: file.size,
      status: "ready" as const,
      url,
    }

    let asset: EditorAsset

    if (kind === "image") {
      const metadata = await loadImageMetadata(url)

      asset = {
        ...baseAsset,
        duration: null,
        height: metadata.height,
        width: metadata.width,
      }
    } else if (kind === "video") {
      const metadata = await loadVideoMetadata(url)

      asset = {
        ...baseAsset,
        duration: metadata.duration,
        height: metadata.height,
        width: metadata.width,
      }
    } else {
      asset = {
        ...baseAsset,
        duration: null,
        height: null,
        width: null,
      }
    }

    set((state) => ({
      assets: [...state.assets, asset],
    }))

    return asset
  },

  removeAsset: (id) => {
    const asset = get().assets.find((entry) => entry.id === id)

    if (asset) {
      URL.revokeObjectURL(asset.url)
    }

    set((state) => ({
      assets: state.assets.filter((entry) => entry.id !== id),
    }))
  },

  getAssetById: (id) => {
    return get().assets.find((asset) => asset.id === id) ?? null
  },

  replaceAssets: (assets) => {
    set({
      assets: [...assets],
    })
  },
}))
