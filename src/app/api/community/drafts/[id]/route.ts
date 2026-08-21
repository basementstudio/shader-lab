import { eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  describeDraftLimit,
  DRAFT_ID_PATTERN,
  MAX_LAB_BYTES,
  normalizeDraftTitle,
  normalizeThumbnailUrl,
  releaseQuota,
  reserveBytes,
  validateDraftPayload,
} from "@/lib/community/publish"
import { putObject } from "@/lib/community/r2"
import { resolveForkedFromId } from "@/lib/community/scenes"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes } from "@/lib/db/schema"

function fail(error: string, status: number) {
  return Response.json({ error }, { status })
}

export function draftLabKey(draftId: string): string {
  return `scenes/${draftId}/draft.lab.json`
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(isCommunityEnabled() && isMediaConfigured())) {
    return fail("Drafts are not configured on this deployment.", 503)
  }

  const session = await getOptionalSession()
  const userId = session?.user.id

  if (!userId) {
    return fail("Sign in to save a draft.", 401)
  }

  const { id: draftId } = await params

  if (!DRAFT_ID_PATTERN.test(draftId)) {
    return fail("Unknown draft.", 404)
  }

  let payload: {
    forkedFromSlug?: unknown
    projectFile?: unknown
    thumbnailUrl?: unknown
    title?: unknown
  }

  try {
    payload = await request.json()
  } catch {
    return fail("Invalid request body.", 400)
  }

  const raw =
    typeof payload.projectFile === "string" ? payload.projectFile : null

  if (!raw) {
    return fail("The scene payload is missing.", 400)
  }

  if (raw.length > MAX_LAB_BYTES) {
    return fail("This scene is too large to save.", 400)
  }

  let validated: ReturnType<typeof validateDraftPayload>
  let thumbnailUrl: string | null

  try {
    validated = validateDraftPayload(raw)
    thumbnailUrl = normalizeThumbnailUrl(payload.thumbnailUrl)
  } catch (cause) {
    return fail(
      cause instanceof Error ? cause.message : "This scene is not valid.",
      400
    )
  }

  const profile = await ensureProfile(userId, {
    avatarUrl: session?.user.image ?? null,
    email: session?.user.email ?? null,
    name: session?.user.name ?? null,
  })

  const db = getDatabase()

  const existingRows = await db
    .select({
      authorId: scenes.authorId,
      deletedAt: scenes.deletedAt,
      status: scenes.status,
    })
    .from(scenes)
    .where(eq(scenes.id, draftId))
    .limit(1)

  const existing = existingRows[0]

  if (existing && (existing.authorId !== profile.userId || existing.deletedAt)) {
    return fail("Unknown draft.", 404)
  }

  if (existing && existing.status !== "draft") {
    return fail("This scene has already been published.", 409)
  }

  if (!existing) {
    const limit = await describeDraftLimit(profile.userId)

    if (limit) {
      return fail(limit, 409)
    }
  }

  const bytes = existing ? 0 : raw.length

  if (bytes > 0) {
    const quota = await reserveBytes(profile.userId, bytes)

    if (!quota.ok) {
      return fail(quota.reason ?? "Quota exceeded.", 429)
    }
  }

  const refund = () =>
    bytes > 0 ? releaseQuota(profile.userId, { bytes }) : Promise.resolve()

  const composition = validated.projectFile.composition
  const now = new Date()
  const labKey = draftLabKey(draftId)
  const title = normalizeDraftTitle(payload.title)
  const forkedFromId = await resolveForkedFromId(payload.forkedFromSlug)

  try {
    await putObject({
      body: validated.body,
      contentType: "application/json",
      key: labKey,
    })
  } catch (cause) {
    await refund()

    throw cause
  }

  const saved = await db
    .insert(scenes)
    .values({
      authorId: profile.userId,
      compositionHeight: Math.round(composition.height),
      compositionWidth: Math.round(composition.width),
      durationSeconds: validated.projectFile.timeline.duration,
      forkedFromId,
      hasCustomShader: validated.hasCustomShader,
      id: draftId,
      labKey,
      labVersion: validated.projectFile.version,
      layerTypes: validated.layerTypes,
      slug: draftId,
      status: "draft",
      thumbnailImageId: thumbnailUrl,
      title,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        compositionHeight: Math.round(composition.height),
        compositionWidth: Math.round(composition.width),
        durationSeconds: validated.projectFile.timeline.duration,
        hasCustomShader: validated.hasCustomShader,
        labKey,
        ...(forkedFromId ? { forkedFromId } : {}),
        labVersion: validated.projectFile.version,
        layerTypes: validated.layerTypes,
        title,
        updatedAt: now,
        ...(thumbnailUrl ? { thumbnailImageId: thumbnailUrl } : {}),
      },
      setWhere: sql`${scenes.authorId} = ${profile.userId}::uuid and ${scenes.status} = 'draft' and ${scenes.deletedAt} is null`,
      target: scenes.id,
    })
    .returning({ id: scenes.id })

  if (saved.length === 0) {
    await refund()

    return fail("This draft can no longer be saved.", 409)
  }

  const assetRows = validated.projectFile.assets.map((asset) => ({
    assetId: asset.id,
    duration: asset.duration ?? null,
    height: asset.height ?? null,
    id: `sa_${nanoid(16)}`,
    kind: asset.kind,
    mimeType: asset.mimeType ?? null,
    provider: "r2" as const,
    providerId: asset.sha256 ?? asset.id,
    sceneId: draftId,
    sha256: asset.sha256 ?? null,
    sizeBytes: asset.sizeBytes ?? 0,
    url: asset.url as string,
    width: asset.width ?? null,
  }))

  await db.delete(sceneAssets).where(eq(sceneAssets.sceneId, draftId))

  if (assetRows.length > 0) {
    await db.insert(sceneAssets).values(assetRows)
  }

  return Response.json({
    draft: {
      id: draftId,
      savedAt: now.toISOString(),
      title,
    },
  })
}
