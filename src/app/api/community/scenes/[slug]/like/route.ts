import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import { toggleLike } from "@/lib/community/engagement"
import { ensureProfile } from "@/lib/community/profile"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const session = await getOptionalSession()

  if (!session) {
    return Response.json({ error: "Sign in to upvote." }, { status: 401 })
  }

  const { slug } = await params

  try {
    await ensureProfile(session.user.id, {
      avatarUrl: session.user.image,
      email: session.user.email,
      name: session.user.name,
    })

    const result = await toggleLike({ slug, userId: session.user.id })

    if (!result) {
      return Response.json({ error: "Scene not found." }, { status: 404 })
    }

    return Response.json(result)
  } catch {
    return Response.json(
      { error: "Could not record that upvote." },
      { status: 500 }
    )
  }
}
