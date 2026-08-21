import { getOptionalSession } from "@/lib/auth/server"
import { rejectBot } from "@/lib/community/bot-check"
import { isCommunityEnabled } from "@/lib/community/config"
import { reportScene } from "@/lib/community/moderation"
import { ensureProfile } from "@/lib/community/profile"
import {
  isReportReason,
  MAX_REPORT_NOTE_LENGTH,
} from "@/lib/community/report-reasons"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const refused = await rejectBot()

  if (refused) {
    return refused
  }

  const session = await getOptionalSession()

  if (!session) {
    return Response.json({ error: "Sign in to report." }, { status: 401 })
  }

  let payload: { note?: unknown; reason?: unknown }

  try {
    payload = (await request.json()) as { note?: unknown; reason?: unknown }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (!isReportReason(payload.reason)) {
    return Response.json({ error: "Pick a reason." }, { status: 400 })
  }

  const note =
    typeof payload.note === "string" && payload.note.trim().length > 0
      ? payload.note.trim().slice(0, MAX_REPORT_NOTE_LENGTH)
      : null

  const { slug } = await params

  try {
    await ensureProfile(session.user.id, {
      avatarUrl: session.user.image,
      email: session.user.email,
      name: session.user.name,
    })

    const result = await reportScene({
      note,
      reason: payload.reason,
      reporterId: session.user.id,
      slug,
    })

    if (result === "notFound") {
      return Response.json({ error: "Scene not found." }, { status: 404 })
    }

    return Response.json({ duplicate: result === "duplicate", received: true })
  } catch {
    return Response.json(
      { error: "Could not file that report." },
      { status: 500 }
    )
  }
}
