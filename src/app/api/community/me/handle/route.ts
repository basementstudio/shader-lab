import { revalidateTag } from "next/cache"
import { connection } from "next/server"
import { getOptionalSession } from "@/lib/auth/server"
import {
  authorTag,
  COMMUNITY_FEED_TAG,
  profileHandleTag,
} from "@/lib/community/cache-tags"
import { rejectBot } from "@/lib/community/bot-check"
import { isCommunityEnabled } from "@/lib/community/config"
import { MAX_HANDLE_CLAIMS, renameHandle } from "@/lib/community/handle-rename"

export async function PATCH(request: Request) {
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

  let payload: { handle?: unknown }

  try {
    payload = (await request.json()) as { handle?: unknown }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const outcome = await renameHandle({
    next: payload.handle,
    userId: session.user.id,
  })

  if (outcome.kind === "missing") {
    return Response.json({ error: "Publish a scene first." }, { status: 404 })
  }

  if (outcome.kind === "invalid") {
    return Response.json({ error: outcome.reason }, { status: 400 })
  }

  if (outcome.kind === "taken") {
    return Response.json(
      { error: "That handle is already taken." },
      { status: 409 }
    )
  }

  if (outcome.kind === "exhausted") {
    return Response.json(
      {
        error: `You have used all ${MAX_HANDLE_CLAIMS - 1} handle changes on this account.`,
      },
      { status: 429 }
    )
  }

  if (outcome.kind === "cooldown") {
    return Response.json(
      {
        error: "You changed your handle recently. Try again later.",
        retryAfter: outcome.retryAfter,
      },
      { status: 429 }
    )
  }

  if (outcome.kind === "renamed") {
    revalidateTag(profileHandleTag(outcome.previous), { expire: 0 })
    revalidateTag(profileHandleTag(outcome.handle), { expire: 0 })
    revalidateTag(authorTag(session.user.id), { expire: 0 })
    revalidateTag(COMMUNITY_FEED_TAG, { expire: 0 })
  }

  return Response.json({ handle: outcome.handle })
}
