import { nanoid } from "nanoid"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled, isMediaConfigured } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"
import {
  MAX_ASSETS_PER_SCENE,
  UPLOADABLE_MIME_TYPES,
} from "@/lib/community/publish"
import { createUploadUrl } from "@/lib/community/r2"

const MAX_ASSET_BYTES = 100 * 1024 * 1024

interface RequestedUpload {
  contentLength?: unknown
  contentType?: unknown
  kind?: unknown
  sha256?: unknown
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

  let payload: { uploads?: unknown }

  try {
    payload = (await request.json()) as { uploads?: unknown }
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

  const draftId = `scn_${nanoid(16)}`
  const targets: {
    contentType: string
    key: string
    publicUrl: string
    sha256: string
    uploadUrl: string
  }[] = []

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

    if (!(contentLength > 0 && contentLength <= MAX_ASSET_BYTES)) {
      return Response.json(
        { error: "One of the files is empty or larger than 100 MB." },
        { status: 400 }
      )
    }

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return Response.json(
        { error: "Each upload needs a sha256 content hash." },
        { status: 400 }
      )
    }

    const key = `scenes/${draftId}/${sha256}.${extensionFor(contentType)}`
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
