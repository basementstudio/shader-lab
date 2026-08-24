import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { customAlphabet } from "nanoid"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes, uploadQuota } from "@/lib/db/schema"
import { slugifyHandle } from "@/lib/community/handle"
import {
  censorProjectFile,
  censorText,
  describeBlockedLanguage,
  findProfanityInProjectFile,
  hasProfanity,
} from "@/lib/community/language"
import { keyFromPublicUrl, scenePrefixOf } from "@/lib/community/r2"
import {
  DEFAULT_DRAFT_TITLE,
  describeUploadLimit,
  MAX_DRAFTS_PER_AUTHOR,
} from "@/lib/community/upload-limits"
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
export const MAX_FORK_LINEAGE_HOPS = 10

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

const UPLOAD_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "model/gltf-binary": "glb",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
}

export interface RequestedUpload {
  contentLength?: unknown
  contentType?: unknown
  kind?: unknown
  sha256?: unknown
}

export interface PlannedUpload {
  contentLength: number
  contentType: string
  key: string
  sha256: string
  storedUrl: string | null
}

export type UploadPlan =
  | { error: string }
  | { signedBytes: number; uploads: PlannedUpload[] }

export function scenePrefixFor(sceneId: string): string {
  return `scenes/${sceneId}`
}

export function planUploads(input: {
  draftId: string
  requested: readonly RequestedUpload[]
  storedUrls: ReadonlyMap<string, string>
}): UploadPlan {
  const uploads: PlannedUpload[] = []
  const chargedKeys = new Set<string>()
  let signedBytes = 0

  for (const upload of input.requested) {
    const contentType =
      typeof upload.contentType === "string" ? upload.contentType : ""
    const contentLength = Number.isSafeInteger(upload.contentLength)
      ? (upload.contentLength as number)
      : -1
    const sha256 = typeof upload.sha256 === "string" ? upload.sha256 : ""

    if (!UPLOADABLE_MIME_TYPES.has(contentType)) {
      return { error: `Unsupported file type "${contentType || "unknown"}".` }
    }

    const oversize = describeUploadLimit({
      mimeType: contentType,
      sizeBytes: contentLength,
    })

    if (oversize) {
      return { error: oversize }
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return { error: "Each upload needs a sha256 content hash." }
    }

    const extension = UPLOAD_EXTENSIONS[contentType] ?? "bin"
    const key = `${scenePrefixFor(input.draftId)}/${sha256}.${extension}`
    const storedUrl = input.storedUrls.get(sha256) ?? null

    if (!(storedUrl || chargedKeys.has(key))) {
      chargedKeys.add(key)
      signedBytes += contentLength
    }

    uploads.push({ contentLength, contentType, key, sha256, storedUrl })
  }

  return { signedBytes, uploads }
}

const sceneSlugSuffix = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6)

export function buildSceneSlug(title: string): string {
  const base = slugifyHandle(title).slice(0, 48).replace(/-+$/g, "")

  return `${base.length >= 2 ? base : "scene"}-${sceneSlugSuffix()}`
}

export function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export interface PublishValidation {
  body: string
  hasCustomShader: boolean
  layerTypes: string[]
  projectFile: LabProjectFile
}

function parseScenePayload(raw: string): {
  body: string
  projectFile: LabProjectFile
  profanityLocation: string | null
} {
  if (raw.length > MAX_LAB_BYTES) {
    throw new Error("This scene is too large.")
  }

  const parsed = parseLabProjectFile(raw)

  for (const asset of parsed.assets) {
    if (asset.url && !isAllowedAssetOrigin(asset.url)) {
      throw new Error(`"${asset.fileName}" points at an untrusted host.`)
    }
  }

  const profanityLocation = findProfanityInProjectFile(parsed)
  const censored = censorProjectFile(parsed)

  return {
    body: censored.changed ? JSON.stringify(censored.projectFile) : raw,
    projectFile: censored.projectFile,
    profanityLocation,
  }
}

function describeScene(
  projectFile: LabProjectFile,
  body: string
): PublishValidation {
  return {
    body,
    hasCustomShader: hasImportedCustomShaderCode(projectFile),
    layerTypes: [...new Set(projectFile.layers.map((layer) => layer.type))],
    projectFile,
  }
}

export function validateDraftPayload(raw: string): PublishValidation {
  const { body, projectFile } = parseScenePayload(raw)

  return describeScene(
    {
      ...projectFile,
      assets: projectFile.assets.filter((asset) => asset.url),
    },
    body
  )
}

export function validateProjectFilePayload(raw: string): PublishValidation {
  const { body, projectFile, profanityLocation } = parseScenePayload(raw)

  if (profanityLocation) {
    throw new Error(describeBlockedLanguage(profanityLocation))
  }

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

  return describeScene(projectFile, body)
}

export function normalizeTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  if (title.length === 0) {
    throw new Error("A title is required.")
  }

  const capped = title.slice(0, MAX_TITLE_LENGTH)

  if (hasProfanity(capped)) {
    throw new Error(describeBlockedLanguage("the title"))
  }

  return capped
}

export function normalizeDraftTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : ""

  return title.length > 0
    ? censorText(title.slice(0, MAX_TITLE_LENGTH))
    : DEFAULT_DRAFT_TITLE
}

export function normalizeThumbnailUrl(value: unknown): string | null {
  const url = typeof value === "string" ? value.trim() : ""

  if (url.length === 0) {
    return null
  }

  if (!isAllowedAssetOrigin(url)) {
    throw new Error("That thumbnail points at an untrusted host.")
  }

  return url
}

export function findAssetOutsideScenePrefixes(
  projectFile: LabProjectFile,
  allowedPrefixes: ReadonlySet<string>
): string | null {
  for (const asset of projectFile.assets) {
    const key = keyFromPublicUrl(asset.url ?? "")

    if (!key) {
      continue
    }

    const prefix = scenePrefixOf(key)

    if (!(prefix && allowedPrefixes.has(prefix))) {
      return asset.fileName
    }
  }

  return null
}

async function readAncestorAssetPrefixes(
  ancestorIds: readonly string[]
): Promise<string[]> {
  if (ancestorIds.length === 0) {
    return []
  }

  const rows = await getDatabase()
    .select({ url: sceneAssets.url })
    .from(sceneAssets)
    .where(inArray(sceneAssets.sceneId, [...ancestorIds]))

  return rows.flatMap((row) => {
    const key = keyFromPublicUrl(row.url)
    const prefix = key ? scenePrefixOf(key) : null

    return prefix ? [prefix] : []
  })
}

export async function collectAllowedScenePrefixes(input: {
  forkedFromId: string | null
  sceneId: string
}): Promise<Set<string>> {
  const db = getDatabase()
  const prefixes = new Set([scenePrefixFor(input.sceneId)])
  const ancestorIds: string[] = []
  let ancestorId = input.forkedFromId

  for (let hop = 0; ancestorId && hop < MAX_FORK_LINEAGE_HOPS; hop += 1) {
    const prefix = scenePrefixFor(ancestorId)

    if (prefixes.has(prefix)) {
      break
    }

    prefixes.add(prefix)
    ancestorIds.push(ancestorId)

    const rows = await db
      .select({ forkedFromId: scenes.forkedFromId })
      .from(scenes)
      .where(eq(scenes.id, ancestorId))
      .limit(1)

    ancestorId = rows[0]?.forkedFromId ?? null
  }

  for (const prefix of await readAncestorAssetPrefixes(ancestorIds)) {
    prefixes.add(prefix)
  }

  return prefixes
}

export function normalizeDescription(value: unknown): string | null {
  const description = typeof value === "string" ? value.trim() : ""

  if (description.length === 0) {
    return null
  }

  const capped = description.slice(0, MAX_DESCRIPTION_LENGTH)

  if (hasProfanity(capped)) {
    throw new Error(describeBlockedLanguage("the description"))
  }

  return capped
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

function chargeableAmount(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

async function reserve(input: {
  addScene: boolean
  bytes: number
  now: Date
  userId: string
}): Promise<QuotaCheck> {
  const bytes = chargeableAmount(input.bytes)

  if (bytes === null) {
    return { ok: false, reason: "That upload size is not valid." }
  }

  const db = getDatabase()
  const bucket = dayBucket(input.now)
  const added = input.addScene ? 1 : 0

  const decision = decideQuota({
    addScene: input.addScene,
    bucket,
    bytes,
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
      bytesUsed: bytes,
      dayBucket: bucket,
      scenesToday: added,
      updatedAt: input.now,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      set: {
        bytesUsed: sql`${uploadQuota.bytesUsed} + ${bytes}`,
        dayBucket: bucket,
        scenesToday: sql`case when ${uploadQuota.dayBucket} = ${bucket} then ${uploadQuota.scenesToday} + ${added} else ${added} end`,
        updatedAt: input.now,
      },
      setWhere: sql`${uploadQuota.bytesUsed} + ${bytes} <= ${MAX_TOTAL_BYTES} and (case when ${uploadQuota.dayBucket} = ${bucket} then ${uploadQuota.scenesToday} else 0 end) + ${added} <= ${MAX_SCENES_PER_DAY}`,
      target: uploadQuota.userId,
    })
    .returning({ userId: uploadQuota.userId })

  if (won.length > 0) {
    return { ok: true }
  }

  const lost = decideQuota({
    addScene: input.addScene,
    bucket,
    bytes,
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
  const bytes = chargeableAmount(input.bytes) ?? 0
  const sceneCount = chargeableAmount(input.scenes) ?? 0

  if (bytes <= 0 && sceneCount <= 0) {
    return
  }

  const bucket = dayBucket(input.now)

  await getDatabase()
    .update(uploadQuota)
    .set({
      bytesUsed: sql`greatest(0, ${uploadQuota.bytesUsed} - ${bytes})`,
      scenesToday: sql`case when ${uploadQuota.dayBucket} = ${bucket} then greatest(0, ${uploadQuota.scenesToday} - ${sceneCount}) else ${uploadQuota.scenesToday} end`,
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

export async function countHeldDraftsForAuthor(
  userId: string
): Promise<number> {
  const rows = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(scenes)
    .where(
      and(
        eq(scenes.authorId, userId),
        eq(scenes.status, "draft"),
        isNull(scenes.deletedAt)
      )
    )

  return rows[0]?.count ?? 0
}

export async function describeDraftLimit(
  userId: string
): Promise<string | null> {
  const held = await countHeldDraftsForAuthor(userId)

  return held >= MAX_DRAFTS_PER_AUTHOR
    ? `You already have ${MAX_DRAFTS_PER_AUTHOR} drafts. Delete or publish one to save another.`
    : null
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
