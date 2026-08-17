import { and, eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDatabase } from "@/lib/db"
import { scenes, uploadQuota } from "@/lib/db/schema"
import { slugifyHandle } from "@/lib/community/handle"
import { isAllowedAssetOrigin } from "@/lib/editor/remote-asset"
import type { LabProjectFile } from "@/lib/editor/project-file"
import {
  hasImportedCustomShaderCode,
  parseLabProjectFile,
} from "@/lib/editor/project-file"

export const DRAFT_ID_PATTERN = /^scn_[A-Za-z0-9_-]{16}$/

export const MAX_SCENES_PER_DAY = 20
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024
export const MAX_ASSETS_PER_SCENE = 12
export const MAX_LAB_BYTES = 8 * 1024 * 1024
export const MAX_TITLE_LENGTH = 80
export const MAX_DESCRIPTION_LENGTH = 500

export const UPLOADABLE_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "model/gltf-binary",
  "model/gltf+json",
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

export function buildSceneSlug(title: string): string {
  const base = slugifyHandle(title).slice(0, 48).replace(/-+$/g, "")

  return `${base.length >= 2 ? base : "scene"}-${nanoid(6).toLowerCase()}`
}

export function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export interface PublishValidation {
  hasCustomShader: boolean
  layerTypes: string[]
  projectFile: LabProjectFile
}

export function validateProjectFilePayload(raw: string): PublishValidation {
  if (raw.length > MAX_LAB_BYTES) {
    throw new Error("This scene is too large to publish.")
  }

  const projectFile = parseLabProjectFile(raw)

  if (projectFile.layers.length === 0) {
    throw new Error("A scene needs at least one visible layer.")
  }

  for (const asset of projectFile.assets) {
    if (!asset.url) {
      throw new Error(
        `"${asset.fileName}" was not uploaded, so the scene cannot be published.`
      )
    }

    if (!isAllowedAssetOrigin(asset.url)) {
      throw new Error(`"${asset.fileName}" points at an untrusted host.`)
    }
  }

  const layerTypes = [...new Set(projectFile.layers.map((layer) => layer.type))]

  return {
    hasCustomShader: hasImportedCustomShaderCode(projectFile),
    layerTypes,
    projectFile,
  }
}

export function normalizeTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  if (title.length === 0) {
    throw new Error("A title is required.")
  }

  return title.slice(0, MAX_TITLE_LENGTH)
}

export function normalizeDescription(value: unknown): string | null {
  const description = typeof value === "string" ? value.trim() : ""

  return description.length > 0
    ? description.slice(0, MAX_DESCRIPTION_LENGTH)
    : null
}

export interface QuotaCheck {
  ok: boolean
  reason?: string
}

export async function reserveQuota(
  userId: string,
  bytes: number,
  now = new Date()
): Promise<QuotaCheck> {
  const db = getDatabase()
  const bucket = dayBucket(now)

  const rows = await db
    .select()
    .from(uploadQuota)
    .where(eq(uploadQuota.userId, userId))
    .limit(1)

  const current = rows[0]
  const scenesToday = current?.dayBucket === bucket ? current.scenesToday : 0
  const bytesUsed = current?.bytesUsed ?? 0

  if (scenesToday >= MAX_SCENES_PER_DAY) {
    return {
      ok: false,
      reason: `You have published ${MAX_SCENES_PER_DAY} scenes today. Try again tomorrow.`,
    }
  }

  if (bytesUsed + bytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: "You have reached your storage limit for community scenes.",
    }
  }

  if (current) {
    await db
      .update(uploadQuota)
      .set({
        bytesUsed: bytesUsed + bytes,
        dayBucket: bucket,
        scenesToday: scenesToday + 1,
        updatedAt: now,
      })
      .where(eq(uploadQuota.userId, userId))
  } else {
    await db.insert(uploadQuota).values({
      bytesUsed: bytes,
      dayBucket: bucket,
      scenesToday: 1,
      userId,
    })
  }

  return { ok: true }
}

export async function countPublishedScenesForAuthor(
  userId: string
): Promise<number> {
  const rows = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(scenes)
    .where(and(eq(scenes.authorId, userId), eq(scenes.status, "published")))

  return rows[0]?.count ?? 0
}
