import { buildRenderProjectState } from "@/lib/agent-bridge/screenshot"
import { describeUploadLimit } from "@/lib/community/upload-limits"
import {
  buildLabProjectFile,
  buildPublishableProjectFile,
  type LabProjectFile,
} from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"
import type { EditorAsset, PresetAssetReference } from "@/types/editor"

export const THUMBNAIL_MAX_TIME_SECONDS = 10
export const THUMBNAIL_WIDTH = 1280
export const THUMBNAIL_MIME = "image/jpeg"

export interface PublishResult {
  slug: string | null
}

interface UploadTarget {
  contentType: string
  key: string
  publicUrl: string
  sha256: string
  uploadUrl: string
}

export function getThumbnailTimeBounds(duration: number): {
  max: number
  min: number
} {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0

  return { max: Math.min(safeDuration, THUMBNAIL_MAX_TIME_SECONDS), min: 0 }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function captureThumbnail(time: number): Promise<Blob> {
  const { exportStillImage } = await import("@/lib/editor/export")
  const projectState = buildRenderProjectState()
  const composition = projectState.compositionSize
  const scale = THUMBNAIL_WIDTH / Math.max(1, composition.width)

  return exportStillImage(projectState, {
    aspectPreset: "original",
    height: Math.max(1, Math.round(composition.height * scale)),
    qualityPreset: "standard",
    time,
    type: THUMBNAIL_MIME,
    width: Math.max(1, Math.round(composition.width * scale)),
  })
}

async function readLocalAssetBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Could not read one of the scene's media files.")
  }

  return await response.arrayBuffer()
}

async function upload(target: UploadTarget, bytes: ArrayBuffer): Promise<void> {
  const response = await fetch(target.uploadUrl, {
    body: bytes,
    headers: {
      "content-length": String(bytes.byteLength),
      "content-type": target.contentType,
    },
    method: "PUT",
  })

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}).`)
  }
}

export const EMPTY_SCENE_MESSAGE =
  "Every layer is hidden, so there is nothing to publish. Show at least one layer first."

export interface PublishPlan {
  assetCount: number
  hiddenLayerCount: number
  problem: string | null
  totalBytes: number
}

function inspectScene(options: { prune: boolean }): {
  localAssets: EditorAsset[]
  plan: PublishPlan
  projectFile: LabProjectFile
} {
  const source = buildLabProjectFile()
  const projectFile = options.prune
    ? buildPublishableProjectFile(source)
    : source
  const referencedIds = new Set(projectFile.assets.map((asset) => asset.id))
  const localAssets = useAssetStore
    .getState()
    .assets.filter(
      (asset) => asset.source === "local" && referencedIds.has(asset.id)
    )

  let problem: string | null =
    options.prune && projectFile.layers.length === 0
      ? EMPTY_SCENE_MESSAGE
      : null
  let totalBytes = 0

  for (const asset of localAssets) {
    totalBytes += asset.sizeBytes

    if (!problem) {
      problem = describeUploadLimit({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      })
    }
  }

  return {
    localAssets,
    plan: {
      assetCount: localAssets.length,
      hiddenLayerCount: source.layers.length - projectFile.layers.length,
      problem,
      totalBytes,
    },
    projectFile,
  }
}

export function describePublishPlan(): PublishPlan {
  return inspectScene({ prune: true }).plan
}

export async function publishScene(input: {
  description: string
  thumbnailTime: number
  title: string
  turnstileToken?: string | null
}): Promise<PublishResult> {
  const { localAssets, plan, projectFile } = inspectScene({ prune: true })

  if (plan.problem) {
    throw new Error(plan.problem)
  }

  const thumbnailBlob = await captureThumbnail(input.thumbnailTime)
  const thumbnailBytes = await thumbnailBlob.arrayBuffer()
  const thumbnailHash = await sha256Hex(thumbnailBytes)

  const assetPayloads = await Promise.all(
    localAssets.map(async (asset) => {
      const bytes = await readLocalAssetBytes(asset.url)

      return {
        asset,
        bytes,
        sha256: await sha256Hex(bytes),
      }
    })
  )

  const draftResponse = await fetch("/api/community/drafts", {
    body: JSON.stringify({
      uploads: [
        {
          contentLength: thumbnailBytes.byteLength,
          contentType: THUMBNAIL_MIME,
          kind: "thumbnail",
          sha256: thumbnailHash,
        },
        ...assetPayloads.map((entry) => ({
          contentLength: entry.bytes.byteLength,
          contentType: entry.asset.mimeType,
          kind: entry.asset.kind,
          sha256: entry.sha256,
        })),
      ],
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })

  const draft = (await draftResponse.json()) as {
    draftId?: string
    error?: string
    uploads?: UploadTarget[]
  }

  if (!(draftResponse.ok && draft.draftId && draft.uploads)) {
    throw new Error(draft.error ?? "Could not start publishing.")
  }

  const [thumbnailTarget, ...assetTargets] = draft.uploads

  if (!thumbnailTarget) {
    throw new Error("Could not prepare the thumbnail upload.")
  }

  await upload(thumbnailTarget, thumbnailBytes)

  const referencesById = new Map<string, PresetAssetReference>()

  for (const [index, entry] of assetPayloads.entries()) {
    const target = assetTargets[index]

    if (!target) {
      throw new Error("Could not prepare one of the media uploads.")
    }

    await upload(target, entry.bytes)

    referencesById.set(entry.asset.id, {
      duration: entry.asset.duration,
      fileName: entry.asset.fileName,
      height: entry.asset.height,
      id: entry.asset.id,
      kind: entry.asset.kind,
      mimeType: entry.asset.mimeType,
      sha256: entry.sha256,
      sizeBytes: entry.bytes.byteLength,
      url: target.publicUrl,
      width: entry.asset.width,
    })
  }

  const publishable = {
    ...projectFile,
    assets: projectFile.assets.map(
      (reference) => referencesById.get(reference.id) ?? reference
    ),
  }

  const publishResponse = await fetch(
    `/api/community/drafts/${draft.draftId}/publish`,
    {
      body: JSON.stringify({
        description: input.description,
        forkedFromSlug: useRemixOriginStore.getState().origin?.slug ?? null,
        projectFile: JSON.stringify(publishable),
        thumbnailUrl: thumbnailTarget.publicUrl,
        title: input.title,
        turnstileToken: input.turnstileToken ?? null,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  )

  const published = (await publishResponse.json()) as {
    error?: string
    scene?: { slug: string | null }
  }

  if (!(publishResponse.ok && published.scene)) {
    throw new Error(published.error ?? "Could not publish this scene.")
  }

  useRemixOriginStore.getState().clearRemixOrigin()

  return { slug: published.scene.slug }
}
