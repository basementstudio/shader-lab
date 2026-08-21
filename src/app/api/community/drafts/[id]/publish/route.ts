import { and, eq, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidateTag } from "next/cache"
import { connection } from "next/server"
import { getOptionalSession } from "@/lib/auth/server"
import { authorTag, COMMUNITY_FEED_TAG } from "@/lib/community/cache-tags"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  buildSceneSlug,
  collectAllowedScenePrefixes,
  DRAFT_ID_PATTERN,
  findAssetOutsideScenePrefixes,
  MAX_LAB_BYTES,
  normalizeDescription,
  normalizeTags,
  normalizeThumbnailUrl,
  normalizeTitle,
  releaseQuota,
  reserveQuota,
  reserveSceneSlot,
  validateProjectFilePayload,
} from "@/lib/community/publish"
import { putObject } from "@/lib/community/r2"
import { resolveForkedFromId } from "@/lib/community/scenes"
import { verifyTurnstile } from "@/lib/community/turnstile"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes } from "@/lib/db/schema"

function badRequest(error: string, status = 400) {
  return Response.json({ error }, { status })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection()

  if (!(isCommunityEnabled() && isMediaConfigured())) {
    return badRequest("Publishing is not configured on this deployment.", 503)
  }

  const session = await getOptionalSession()
  const userId = session?.user.id

  if (!userId) {
    return badRequest("Sign in to publish.", 401)
  }

  const { id: draftId } = await params

  if (!DRAFT_ID_PATTERN.test(draftId)) {
    return badRequest("Unknown draft.", 404)
  }

  let payload: {
    description?: unknown
    forkedFromSlug?: unknown
    projectFile?: unknown
    thumbnailUrl?: unknown
    tags?: unknown
    title?: unknown
    turnstileToken?: unknown
  }

  try {
    payload = await request.json()
  } catch {
    return badRequest("Invalid request body.")
  }

  const turnstile = await verifyTurnstile(
    typeof payload.turnstileToken === "string" ? payload.turnstileToken : null,
    request.headers.get("cf-connecting-ip")
  )

  if (!turnstile.ok) {
    return badRequest("Could not verify that you are human. Please retry.", 403)
  }

  let title: string
  let description: string | null
  let tags: string[]

  try {
    title = normalizeTitle(payload.title)
    description = normalizeDescription(payload.description)
    tags = normalizeTags(payload.tags)
  } catch (cause) {
    return badRequest(cause instanceof Error ? cause.message : "Invalid title.")
  }

  const raw =
    typeof payload.projectFile === "string" ? payload.projectFile : null

  if (!raw) {
    return badRequest("The scene payload is missing.")
  }

  if (raw.length > MAX_LAB_BYTES) {
    return badRequest("This scene is too large to publish.")
  }

  let validated: ReturnType<typeof validateProjectFilePayload>

  try {
    validated = validateProjectFilePayload(raw)
  } catch (cause) {
    return badRequest(
      cause instanceof Error ? cause.message : "This scene is not valid."
    )
  }

  let thumbnailUrl: string | null

  try {
    thumbnailUrl = normalizeThumbnailUrl(payload.thumbnailUrl)
  } catch (cause) {
    return badRequest(
      cause instanceof Error ? cause.message : "That thumbnail is not valid."
    )
  }

  if (!thumbnailUrl) {
    return badRequest("A thumbnail is required.")
  }

  const profile = await ensureProfile(userId, {
    avatarUrl: session?.user.image ?? null,
    email: session?.user.email ?? null,
    name: session?.user.name ?? null,
  })

  const labKey = `scenes/${draftId}/scene.lab.json`
  const db = getDatabase()
  const now = new Date()
  const composition = validated.projectFile.composition

  const priorRows = await db
    .select({
      authorId: scenes.authorId,
      deletedAt: scenes.deletedAt,
      forkedFromId: scenes.forkedFromId,
      labKey: scenes.labKey,
      publishedAt: scenes.publishedAt,
      slug: scenes.slug,
      status: scenes.status,
    })
    .from(scenes)
    .where(eq(scenes.id, draftId))
    .limit(1)

  const prior = priorRows[0]

  if (prior && (prior.authorId !== profile.userId || prior.deletedAt)) {
    return badRequest("Unknown draft.", 404)
  }

  if (prior && prior.status !== "draft") {
    return badRequest("This scene has already been published.", 409)
  }

  const forkedFromId =
    (await resolveForkedFromId(payload.forkedFromSlug)) ??
    prior?.forkedFromId ??
    null

  const foreignAsset = findAssetOutsideScenePrefixes(
    validated.projectFile,
    await collectAllowedScenePrefixes({ forkedFromId, sceneId: draftId })
  )

  if (foreignAsset) {
    return badRequest(`"${foreignAsset}" belongs to another scene.`)
  }

  const sceneBytes = raw.length

  const quota = prior
    ? await reserveSceneSlot(userId)
    : await reserveQuota(userId, sceneBytes)

  if (!quota.ok) {
    return badRequest(quota.reason ?? "Quota exceeded.", 429)
  }

  // Promoting only spent a scene slot; a first publish also spent the bytes.
  const refund = () =>
    releaseQuota(
      userId,
      prior ? { scenes: 1 } : { bytes: sceneBytes, scenes: 1 }
    )

  const slug = buildSceneSlug(title)

  const shared = {
    compositionHeight: Math.round(composition.height),
    compositionWidth: Math.round(composition.width),
    description,
    durationSeconds: validated.projectFile.timeline.duration,
    forkedFromId,
    hasCustomShader: validated.hasCustomShader,
    labKey,
    labVersion: validated.projectFile.version,
    layerTypes: validated.layerTypes,
    publishedAt: now,
    slug,
    status: "published" as const,
    tags,
    thumbnailImageId: thumbnailUrl,
    title,
    updatedAt: now,
  }

  if (prior) {
    const promoted = await db
      .update(scenes)
      .set(shared)
      .where(
        and(
          eq(scenes.id, draftId),
          eq(scenes.authorId, profile.userId),
          eq(scenes.status, "draft"),
          isNull(scenes.deletedAt)
        )
      )
      .returning({ id: scenes.id })

    if (promoted.length === 0) {
      await refund()

      return badRequest("This draft can no longer be published.", 409)
    }
  } else {
    const claimed = await db
      .insert(scenes)
      .values({ ...shared, authorId: profile.userId, id: draftId })
      .onConflictDoNothing({ target: scenes.id })
      .returning({ id: scenes.id })

    if (claimed.length === 0) {
      await refund()

      return badRequest("Unknown draft.", 404)
    }
  }

  try {
    await putObject({
      body: validated.body,
      contentType: "application/json",
      key: labKey,
    })
  } catch (cause) {
    if (prior) {
      await db
        .update(scenes)
        .set({
          labKey: prior.labKey,
          publishedAt: prior.publishedAt,
          slug: prior.slug,
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(scenes.id, draftId))
    } else {
      await db.delete(scenes).where(eq(scenes.id, draftId))
    }

    await refund()

    throw cause
  }

  const assetRows = validated.projectFile.assets
    .filter((asset) => asset.url)
    .map((asset) => ({
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

  revalidateTag(COMMUNITY_FEED_TAG, "max")
  revalidateTag(authorTag(profile.userId), "max")

  return Response.json({
    scene: { id: draftId, slug },
    turnstileSkipped: turnstile.skipped,
  })
}
