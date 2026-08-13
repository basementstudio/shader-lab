import { and, eq, isNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  buildSceneSlug,
  MAX_LAB_BYTES,
  normalizeDescription,
  normalizeTitle,
  reserveQuota,
  validateProjectFilePayload,
} from "@/lib/community/publish"
import { putObject } from "@/lib/community/r2"
import { verifyTurnstile } from "@/lib/community/turnstile"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes } from "@/lib/db/schema"

const DRAFT_ID_PATTERN = /^scn_[A-Za-z0-9_-]{16}$/

function badRequest(error: string, status = 400) {
  return Response.json({ error }, { status })
}

async function resolveForkedFromId(slug: unknown): Promise<string | null> {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 120) {
    return null
  }

  const rows = await getDatabase()
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        eq(scenes.slug, slug),
        eq(scenes.status, "published"),
        isNull(scenes.deletedAt)
      )
    )
    .limit(1)

  return rows[0]?.id ?? null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  try {
    title = normalizeTitle(payload.title)
    description = normalizeDescription(payload.description)
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

  const thumbnailUrl =
    typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl : null

  if (!thumbnailUrl) {
    return badRequest("A thumbnail is required.")
  }

  const totalBytes = validated.projectFile.assets.reduce(
    (sum, asset) => sum + (asset.sizeBytes ?? 0),
    raw.length
  )

  const quota = await reserveQuota(userId, totalBytes)

  if (!quota.ok) {
    return badRequest(quota.reason ?? "Quota exceeded.", 429)
  }

  const profile = await ensureProfile(userId, {
    avatarUrl: session?.user.image ?? null,
    email: session?.user.email ?? null,
    name: session?.user.name ?? null,
  })

  const labKey = `scenes/${draftId}/scene.lab.json`
  await putObject({
    body: raw,
    contentType: "application/json",
    key: labKey,
  })

  const db = getDatabase()
  const now = new Date()
  const composition = validated.projectFile.composition
  const forkedFromId = await resolveForkedFromId(payload.forkedFromSlug)

  await db.insert(scenes).values({
    authorId: profile.userId,
    compositionHeight: Math.round(composition.height),
    compositionWidth: Math.round(composition.width),
    description,
    durationSeconds: validated.projectFile.timeline.duration,
    forkedFromId,
    hasCustomShader: validated.hasCustomShader,
    id: draftId,
    labKey,
    labVersion: validated.projectFile.version,
    layerTypes: validated.layerTypes,
    publishedAt: now,
    slug: buildSceneSlug(title),
    status: "published",
    thumbnailImageId: thumbnailUrl,
    title,
    updatedAt: now,
  })

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

  if (assetRows.length > 0) {
    await db.insert(sceneAssets).values(assetRows)
  }

  const created = await db
    .select({ slug: scenes.slug })
    .from(scenes)
    .where(eq(scenes.id, draftId))
    .limit(1)

  return Response.json({
    scene: { id: draftId, slug: created[0]?.slug ?? null },
    turnstileSkipped: turnstile.skipped,
  })
}
