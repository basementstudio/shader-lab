import { and, eq, isNull, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  DRAFT_ID_PATTERN,
  MAX_LAB_BYTES,
  normalizeDraftTitle,
  reserveBytes,
  validateDraftPayload,
} from "@/lib/community/publish"
import {
  keyFromPublicUrl,
  putObject,
  scenePrefixOf,
} from "@/lib/community/r2"
import { MAX_DRAFTS_PER_AUTHOR } from "@/lib/community/upload-limits"
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

  try {
    validated = validateDraftPayload(raw)
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
    const held = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scenes)
      .where(
        and(
          eq(scenes.authorId, profile.userId),
          eq(scenes.status, "draft"),
          isNull(scenes.deletedAt)
        )
      )

    if ((held[0]?.count ?? 0) >= MAX_DRAFTS_PER_AUTHOR) {
      return fail(
        `You already have ${MAX_DRAFTS_PER_AUTHOR} drafts. Delete or publish one to save another.`,
        409
      )
    }
  }

  const priorAssets = await db
    .select({ assetId: sceneAssets.assetId })
    .from(sceneAssets)
    .where(eq(sceneAssets.sceneId, draftId))

  const charged = new Set(priorAssets.map((row) => row.assetId))
  const ownPrefix = `scenes/${draftId}`

  const bytes = validated.projectFile.assets.reduce((sum, asset) => {
    if (charged.has(asset.id)) {
      return sum
    }

    const key = keyFromPublicUrl(asset.url ?? "")

    if (!key || scenePrefixOf(key) !== ownPrefix) {
      return sum
    }

    return sum + (asset.sizeBytes ?? 0)
  }, existing ? 0 : raw.length)

  if (bytes > 0) {
    const quota = await reserveBytes(profile.userId, bytes)

    if (!quota.ok) {
      return fail(quota.reason ?? "Quota exceeded.", 429)
    }
  }

  const composition = validated.projectFile.composition
  const now = new Date()
  const labKey = draftLabKey(draftId)
  const thumbnailUrl =
    typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl : null
  const title = normalizeDraftTitle(payload.title)

  await putObject({
    body: raw,
    contentType: "application/json",
    key: labKey,
  })

  const saved = await db
    .insert(scenes)
    .values({
      authorId: profile.userId,
      compositionHeight: Math.round(composition.height),
      compositionWidth: Math.round(composition.width),
      durationSeconds: validated.projectFile.timeline.duration,
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
