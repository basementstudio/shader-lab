import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  DRAFT_ID_PATTERN,
  MAX_ASSETS_PER_SCENE,
  UPLOADABLE_MIME_TYPES,
} from "@/lib/community/publish"
import { createUploadUrl } from "@/lib/community/r2"
import { describeUploadLimit } from "@/lib/community/upload-limits"
import { getDatabase } from "@/lib/db"
import { sceneAssets, scenes } from "@/lib/db/schema"

interface RequestedUpload {
  contentLength?: unknown
  contentType?: unknown
  kind?: unknown
  sha256?: unknown
}

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

// A caller-supplied id decides where the presigned PUTs land, so it has to be
// proved to be theirs first: without this an attacker signs an upload into
// someone else's scene prefix and overwrites a published scene's media.
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

  // 404 rather than 403 for someone else's id, so this cannot be used to ask
  // whether an id exists.
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

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
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

  return map[contentType] ?? "bin"
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
  const targets: UploadTarget[] = []

  for (const upload of requested) {
    const contentType =
      typeof upload.contentType === "string" ? upload.contentType : ""
    const contentLength =
      typeof upload.contentLength === "number" ? upload.contentLength : -1
    const sha256 = typeof upload.sha256 === "string" ? upload.sha256 : ""

    if (!UPLOADABLE_MIME_TYPES.has(contentType)) {
      return Response.json(
        { error: `Unsupported file type "${contentType || "unknown"}".` },
        { status: 400 }
      )
    }

    const oversize = describeUploadLimit({
      mimeType: contentType,
      sizeBytes: contentLength,
    })

    if (oversize) {
      return Response.json({ error: oversize }, { status: 400 })
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return Response.json(
        { error: "Each upload needs a sha256 content hash." },
        { status: 400 }
      )
    }

    const key = `scenes/${draftId}/${sha256}.${extensionFor(contentType)}`
    const alreadyStored = stored.get(sha256)

    if (alreadyStored) {
      targets.push({
        alreadyStored: true,
        contentType,
        key,
        publicUrl: alreadyStored,
        sha256,
      })

      continue
    }

    const signed = await createUploadUrl({ contentLength, contentType, key })

    targets.push({
      contentType,
      key,
      publicUrl: signed.publicUrl,
      sha256,
      uploadUrl: signed.uploadUrl,
    })
  }

  return Response.json({
    authorHandle: profile.handle,
    draftId,
    uploads: targets,
  })
}
