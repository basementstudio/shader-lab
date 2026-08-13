import { getOptionalSession } from "@/lib/auth/server"
import { isCommunityEnabled } from "@/lib/community/config"
import {
  isModerator,
  listOpenReports,
  resolveReportsForScene,
} from "@/lib/community/moderation"

function notFound() {
  return Response.json({ error: "Not found." }, { status: 404 })
}

export async function GET() {
  if (!isCommunityEnabled()) {
    return notFound()
  }

  const session = await getOptionalSession()

  if (!isModerator(session)) {
    return notFound()
  }

  try {
    return Response.json({ reports: await listOpenReports() })
  } catch {
    return Response.json({ error: "Could not load reports." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!isCommunityEnabled()) {
    return notFound()
  }

  const session = await getOptionalSession()

  if (!(session && isModerator(session))) {
    return notFound()
  }

  let payload: { slug?: unknown }

  try {
    payload = (await request.json()) as { slug?: unknown }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (typeof payload.slug !== "string" || payload.slug.length === 0) {
    return Response.json({ error: "Missing slug." }, { status: 400 })
  }

  try {
    return Response.json({
      resolved: await resolveReportsForScene({
        moderatorId: session.user.id,
        slug: payload.slug,
      }),
    })
  } catch {
    return Response.json(
      { error: "Could not resolve those reports." },
      { status: 500 }
    )
  }
}
