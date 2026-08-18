import { and, eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDatabase } from "@/lib/db"
import { scenes, uploadQuota } from "@/lib/db/schema"
import { slugifyHandle } from "@/lib/community/handle"
import { DEFAULT_DRAFT_TITLE } from "@/lib/community/upload-limits"
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

function parseScenePayload(raw: string): LabProjectFile {
  if (raw.length > MAX_LAB_BYTES) {
    throw new Error("This scene is too large.")
  }

  const projectFile = parseLabProjectFile(raw)

  for (const asset of projectFile.assets) {
    if (asset.url && !isAllowedAssetOrigin(asset.url)) {
      throw new Error(`"${asset.fileName}" points at an untrusted host.`)
    }
  }

  return projectFile
}

function describeScene(projectFile: LabProjectFile): PublishValidation {
  return {
    hasCustomShader: hasImportedCustomShaderCode(projectFile),
    layerTypes: [...new Set(projectFile.layers.map((layer) => layer.type))],
    projectFile,
  }
}

export function validateDraftPayload(raw: string): PublishValidation {
  const projectFile = parseScenePayload(raw)

  return describeScene({
    ...projectFile,
    assets: projectFile.assets.filter((asset) => asset.url),
  })
}

export function validateProjectFilePayload(raw: string): PublishValidation {
  const projectFile = parseScenePayload(raw)

  if (projectFile.layers.length === 0) {
    throw new Error("A scene needs at least one visible layer.")
  }

  for (const asset of projectFile.assets) {
    if (!asset.url) {
      throw new Error(
        `"${asset.fileName}" was not uploaded, so the scene cannot be published.`
      )
    }
  }

  return describeScene(projectFile)
}

export function normalizeTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  if (title.length === 0) {
    throw new Error("A title is required.")
  }

  return title.slice(0, MAX_TITLE_LENGTH)
}

export function normalizeDraftTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  return title.length > 0
    ? title.slice(0, MAX_TITLE_LENGTH)
    : DEFAULT_DRAFT_TITLE
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

export interface QuotaSnapshot {
  bytesUsed: number
  dayBucket: string
  scenesToday: number
}

export function decideQuota(input: {
  addScene: boolean
  bucket: string
  bytes: number
  current: QuotaSnapshot | null
}): QuotaCheck {
  const scenesToday =
    input.current?.dayBucket === input.bucket ? input.current.scenesToday : 0

  if (input.addScene && scenesToday >= MAX_SCENES_PER_DAY) {
    return {
      ok: false,
      reason: `You have published ${MAX_SCENES_PER_DAY} scenes today. Try again tomorrow.`,
    }
  }

  if ((input.current?.bytesUsed ?? 0) + input.bytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: "You have reached your storage limit for community scenes.",
    }
  }

  return { ok: true }
}

async function readQuota(userId: string): Promise<QuotaSnapshot | null> {
  const rows = await getDatabase()
    .select({
      bytesUsed: uploadQuota.bytesUsed,
      dayBucket: uploadQuota.dayBucket,
      scenesToday: uploadQuota.scenesToday,
    })
    .from(uploadQuota)
    .where(eq(uploadQuota.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

async function reserve(input: {
  addScene: boolean
  bytes: number
  now: Date
  userId: string
}): Promise<QuotaCheck> {
  const db = getDatabase()
  const bucket = dayBucket(input.now)
  const added = input.addScene ? 1 : 0

  const decision = decideQuota({
    addScene: input.addScene,
    bucket,
    bytes: input.bytes,
    current: await readQuota(input.userId),
  })

  if (!decision.ok) {
    return decision
  }

  // The caps live in the write, not in the read above. Two saves racing near a
  // limit both pass a snapshot check, so the predicate has to be re-evaluated by
  // the row lock that serialises them; the read only exists to name which cap
  // was hit.
  const won = await db
    .insert(uploadQuota)
    .values({
      bytesUsed: input.bytes,
      dayBucket: bucket,
      scenesToday: added,
      updatedAt: input.now,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      set: {
        bytesUsed: sql`${uploadQuota.bytesUsed} + ${input.bytes}`,
        dayBucket: bucket,
        scenesToday: sql`case when ${uploadQuota.dayBucket} = ${bucket} then ${uploadQuota.scenesToday} + ${added} else ${added} end`,
        updatedAt: input.now,
      },
      setWhere: sql`${uploadQuota.bytesUsed} + ${input.bytes} <= ${MAX_TOTAL_BYTES} and (case when ${uploadQuota.dayBucket} = ${bucket} then ${uploadQuota.scenesToday} else 0 end) + ${added} <= ${MAX_SCENES_PER_DAY}`,
      target: uploadQuota.userId,
    })
    .returning({ userId: uploadQuota.userId })

  if (won.length > 0) {
    return { ok: true }
  }

  const lost = decideQuota({
    addScene: input.addScene,
    bucket,
    bytes: input.bytes,
    current: await readQuota(input.userId),
  })

  return lost.ok
    ? { ok: false, reason: "Could not reserve storage. Please retry." }
    : lost
}

async function release(input: {
  bytes: number
  now: Date
  scenes: number
  userId: string
}): Promise<void> {
  if (input.bytes <= 0 && input.scenes <= 0) {
    return
  }

  const bucket = dayBucket(input.now)

  await getDatabase()
    .update(uploadQuota)
    .set({
      bytesUsed: sql`greatest(0, ${uploadQuota.bytesUsed} - ${input.bytes})`,
      scenesToday: sql`case when ${uploadQuota.dayBucket} = ${bucket} then greatest(0, ${uploadQuota.scenesToday} - ${input.scenes}) else ${uploadQuota.scenesToday} end`,
      updatedAt: input.now,
    })
    .where(eq(uploadQuota.userId, input.userId))
}

// A save that never reached storage must not keep spending the allowance.
export function releaseQuota(
  userId: string,
  input: { bytes?: number; scenes?: number },
  now = new Date()
): Promise<void> {
  return release({
    bytes: input.bytes ?? 0,
    now,
    scenes: input.scenes ?? 0,
    userId,
  })
}

export function reserveBytes(
  userId: string,
  bytes: number,
  now = new Date()
): Promise<QuotaCheck> {
  return reserve({ addScene: false, bytes, now, userId })
}

export function reserveSceneSlot(
  userId: string,
  now = new Date()
): Promise<QuotaCheck> {
  return reserve({ addScene: true, bytes: 0, now, userId })
}

export function reserveQuota(
  userId: string,
  bytes: number,
  now = new Date()
): Promise<QuotaCheck> {
  return reserve({ addScene: true, bytes, now, userId })
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
