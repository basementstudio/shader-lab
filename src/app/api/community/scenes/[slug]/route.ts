import { revalidateTag } from "next/cache"
import { connection } from "next/server"
import { getOptionalSession } from "@/lib/auth/server"
import { rejectBot } from "@/lib/community/bot-check"
import {
  authorTag,
  COMMUNITY_FEED_TAG,
  sceneTag,
} from "@/lib/community/cache-tags"
import { isCommunityEnabled } from "@/lib/community/config"
import { removeScene } from "@/lib/community/moderation"
import { getPublicScene } from "@/lib/community/public-scenes"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const { slug } = await params

  try {
    const scene = await getPublicScene(slug)

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
  await connection()

  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const refused = await rejectBot()

  if (refused) {
    return refused
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

    revalidateTag(COMMUNITY_FEED_TAG, "max")
    revalidateTag(authorTag(outcome.authorId), "max")
    revalidateTag(sceneTag(slug), "max")

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
