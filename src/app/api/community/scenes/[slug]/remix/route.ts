import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import { recordRemix, resolveActorKey } from "@/lib/community/engagement"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  let payload: { anonId?: unknown } = {}

  try {
    payload = (await request.json()) as { anonId?: unknown }
  } catch {
    payload = {}
  }

  const session = await getOptionalSession()
  const actorKey = resolveActorKey({
    anonId: payload.anonId,
    userId: session?.user.id ?? null,
  })

  if (!actorKey) {
    return Response.json({ error: "Missing actor." }, { status: 400 })
  }

  const { slug } = await params

  try {
    const result = await recordRemix({ actorKey, slug, when: new Date() })

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
