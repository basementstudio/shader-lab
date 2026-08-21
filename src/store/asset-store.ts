import { create } from "zustand"
import {
  forgetStoredAssets,
  persistAssetBlob,
} from "@/lib/editor/autosave/assets"
import { getDefaultProjectAssets } from "@/lib/editor/default-project"
import { inferFileAssetKind, isAudioFileName } from "@/lib/editor/media-file"
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
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "application/octet-stream",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
])

const MAX_SIZE_BYTES = 100 * 1024 * 1024

function validateFile(file: File): AssetKind {
  const kind = inferFileAssetKind(file)
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (
    !kind ||
    (!(
      ACCEPTED_TYPES.has(mimeType) ||
      (kind === "video" && fileName.endsWith(".mov")) ||
      (kind === "audio" && isAudioFileName(fileName))
    ) &&
      kind !== "model")
  ) {
    throw new Error(
      `Unsupported file type "${file.type || "unknown"}". Accepted: PNG, JPG, WebP, GIF, SVG, MP4, WebM, MOV, GLB, GLTF, OBJ, MP3, WAV, M4A, FLAC, OGG.`
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_SIZE_BYTES / 1024 / 1024} MB.`
    )
  }

  return kind
}

function loadImageMetadata(
  url: string
): Promise<{ height: number; width: number }> {
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
  url: string
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

function loadAudioMetadata(url: string): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio")
    audio.preload = "metadata"

    const settle = (duration: number) => {
      audio.ondurationchange = null
      audio.onloadedmetadata = null
      audio.onerror = null
      resolve({ duration: Number.isFinite(duration) ? duration : 0 })
    }

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        settle(audio.duration)
        return
      }

      audio.ondurationchange = () => {
        if (Number.isFinite(audio.duration)) {
          settle(audio.duration)
        }
      }

      audio.currentTime = Number.MAX_SAFE_INTEGER
    }

    audio.onerror = () => {
      reject(new Error("Failed to read audio metadata."))
    }

    audio.src = url
  })
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assets: getDefaultProjectAssets(),

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
      source: "local" as const,
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
    } else if (kind === "audio") {
      const metadata = await loadAudioMetadata(url)

      asset = {
        ...baseAsset,
        duration: metadata.duration,
        height: null,
        width: null,
      }
    } else {
      asset = {
        ...baseAsset,
        duration: null,
        height: null,
        width: null,
      }
    }

    await persistAssetBlob(asset, file)

    set((state) => ({
      assets: [...state.assets, asset],
    }))

    return asset
  },

  removeAsset: (id) => {
    const asset = get().assets.find((entry) => entry.id === id)

    if (asset?.source === "local") {
      URL.revokeObjectURL(asset.url)
    }

    void forgetStoredAssets([id])

    set((state) => ({
      assets: state.assets.filter((entry) => entry.id !== id),
    }))
  },

  getAssetById: (id) => {
    return get().assets.find((asset) => asset.id === id) ?? null
  },

  replaceAssets: (assets) => {
    const retained = new Set(assets.map((asset) => asset.url))

    for (const asset of get().assets) {
      if (asset.source === "local" && !retained.has(asset.url)) {
        URL.revokeObjectURL(asset.url)
      }
    }

    set({
      assets: [...assets],
    })
  },
}))
