import { connection } from "next/server"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import { listLikedSlugs } from "@/lib/community/engagement"

export async function GET() {
  await connection()

  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const session = await getOptionalSession()

  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 })
  }

  try {
    return Response.json({ slugs: await listLikedSlugs(session.user.id) })
  } catch {
    return Response.json(
      { error: "Could not load your likes." },
      { status: 500 }
    )
  }
}
