import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import { removeScene } from "@/lib/community/moderation"
import { getPublishedScene } from "@/lib/community/scenes"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const { slug } = await params

  try {
    const scene = await getPublishedScene(slug)

    if (!scene) {
      return Response.json({ error: "Scene not found." }, { status: 404 })
    }

    return Response.json({ scene })
  } catch {
    return Response.json({ error: "Could not load scene." }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const session = await getOptionalSession()

  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 })
  }

  const { slug } = await params

  try {
    const outcome = await removeScene({ session, slug })

    if (outcome.kind === "notFound") {
      return Response.json({ error: "Scene not found." }, { status: 404 })
    }

    if (outcome.kind === "forbidden") {
      return Response.json(
        { error: "That is not your scene." },
        { status: 403 }
      )
    }

    return Response.json({
      mode: outcome.mode,
      purgedObjects: outcome.purgedObjects,
      removed: true,
    })
  } catch {
    return Response.json(
      { error: "Could not remove that scene." },
      { status: 500 }
    )
  }
}
