import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  DRAFT_ID_PATTERN,
  MAX_ASSETS_PER_SCENE,
  planUploads,
  releaseQuota,
  type RequestedUpload,
  reserveBytes,
} from "@/lib/community/publish"
import { createUploadUrl } from "@/lib/community/r2"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes } from "@/lib/db/schema"

interface UploadTarget {
  alreadyStored?: boolean
  contentType: string
  key: string
  publicUrl: string
  sha256: string
  uploadUrl?: string
}

type DraftClaim =
  | { draftId: string }
  | { error: string; status: number }

async function claimDraftId(input: {
  authorId: string
  requested: unknown
}): Promise<DraftClaim> {
  if (input.requested === undefined || input.requested === null) {
    return { draftId: `scn_${nanoid(16)}` }
  }

  if (
    typeof input.requested !== "string" ||
    !DRAFT_ID_PATTERN.test(input.requested)
  ) {
    return { error: "Unknown draft.", status: 404 }
  }

  const rows = await getDatabase()
    .select({ authorId: scenes.authorId, status: scenes.status })
    .from(scenes)
    .where(eq(scenes.id, input.requested))
    .limit(1)

  const existing = rows[0]

  if (!existing) {
    return { draftId: input.requested }
  }

  if (existing.authorId !== input.authorId) {
    return { error: "Unknown draft.", status: 404 }
  }

  if (existing.status !== "draft") {
    return { error: "This scene has already been published.", status: 409 }
  }

  return { draftId: input.requested }
}

async function readStoredShas(
  draftId: string,
  shas: readonly string[]
): Promise<Map<string, string>> {
  if (shas.length === 0) {
    return new Map()
  }

  const rows = await getDatabase()
    .select({ sha256: sceneAssets.sha256, url: sceneAssets.url })
    .from(sceneAssets)
    .where(
      and(eq(sceneAssets.sceneId, draftId), inArray(sceneAssets.sha256, shas))
    )

  return new Map(
    rows.flatMap((row) => (row.sha256 ? [[row.sha256, row.url]] : []))
  )
}

export async function POST(request: Request) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  if (!isMediaConfigured()) {
    return Response.json(
      { error: "Uploads are not configured on this deployment." },
      { status: 503 }
    )
  }

  const session = await getOptionalSession()
  const userId = session?.user.id

  if (!userId) {
    return Response.json({ error: "Sign in to publish." }, { status: 401 })
  }

  let payload: { draftId?: unknown; uploads?: unknown }

  try {
    payload = (await request.json()) as { draftId?: unknown; uploads?: unknown }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const requested = Array.isArray(payload.uploads)
    ? (payload.uploads as RequestedUpload[])
    : []

  if (requested.length > MAX_ASSETS_PER_SCENE + 1) {
    return Response.json(
      { error: `A scene can carry at most ${MAX_ASSETS_PER_SCENE} assets.` },
      { status: 400 }
    )
  }

  const profile = await ensureProfile(userId, {
    avatarUrl: session?.user.image ?? null,
    email: session?.user.email ?? null,
    name: session?.user.name ?? null,
  })

  const claim = await claimDraftId({
    authorId: profile.userId,
    requested: payload.draftId,
  })

  if ("error" in claim) {
    return Response.json({ error: claim.error }, { status: claim.status })
  }

  const { draftId } = claim
  const stored = await readStoredShas(
    draftId,
    requested.flatMap((upload) =>
      typeof upload.sha256 === "string" ? [upload.sha256] : []
    )
  )
  const plan = planUploads({ draftId, requested, storedUrls: stored })

  if ("error" in plan) {
    return Response.json({ error: plan.error }, { status: 400 })
  }

  if (plan.signedBytes > 0) {
    const quota = await reserveBytes(profile.userId, plan.signedBytes)

    if (!quota.ok) {
      return Response.json(
        { error: quota.reason ?? "Quota exceeded." },
        { status: 413 }
      )
    }
  }

  const targets: UploadTarget[] = []

  try {
    for (const upload of plan.uploads) {
      if (upload.storedUrl) {
        targets.push({
          alreadyStored: true,
          contentType: upload.contentType,
          key: upload.key,
          publicUrl: upload.storedUrl,
          sha256: upload.sha256,
        })

        continue
      }

      const signed = await createUploadUrl({
        contentLength: upload.contentLength,
        contentType: upload.contentType,
        key: upload.key,
      })

      targets.push({
        contentType: upload.contentType,
        key: upload.key,
        publicUrl: signed.publicUrl,
        sha256: upload.sha256,
        uploadUrl: signed.uploadUrl,
      })
    }
  } catch (cause) {
    await releaseQuota(profile.userId, { bytes: plan.signedBytes })

    throw cause
  }

  return Response.json({
    authorHandle: profile.handle,
    draftId,
    uploads: targets,
  })
}
