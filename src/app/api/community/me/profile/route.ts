import { connection } from "next/server"
import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import { ensureProfile } from "@/lib/community/profile"

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
    const profile = await ensureProfile(session.user.id, {
      avatarUrl: session.user.image,
      email: session.user.email,
      name: session.user.name,
    })

    return Response.json({
      avatarUrl: profile.avatarUrl,
      displayName: profile.displayName,
      handle: profile.handle,
    })
  } catch {
    return Response.json(
      { error: "Could not load your profile." },
      { status: 500 }
    )
  }
}
