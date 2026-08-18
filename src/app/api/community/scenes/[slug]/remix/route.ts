import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import {
  readPlatformClientIp,
  recordRemix,
  resolveActorKey,
} from "@/lib/community/engagement"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const session = await getOptionalSession()
  const when = new Date()
  const actorKey = resolveActorKey({
    clientIp: readPlatformClientIp(request.headers),
    userId: session?.user.id ?? null,
    when,
  })

  const { slug } = await params

  try {
    const result = await recordRemix({ actorKey, slug, when })

    if (!result) {
      return Response.json({ error: "Scene not found." }, { status: 404 })
    }

    return Response.json(result)
  } catch {
    return Response.json(
      { error: "Could not record that remix." },
      { status: 500 }
    )
  }
}
