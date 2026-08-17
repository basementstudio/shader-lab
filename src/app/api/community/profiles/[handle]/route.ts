import { isCommunityEnabled } from "@/lib/community/config"
import { isLookupableHandle } from "@/lib/community/handle"
import { toProfileView } from "@/lib/community/profiles"
import { getPublicProfile } from "@/lib/community/public-profiles"

const PROFILE_CACHE =
  "public, s-maxage=60, stale-while-revalidate=300, max-age=0"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  if (!isCommunityEnabled()) {
    return Response.json({ error: "Not available." }, { status: 503 })
  }

  const handle = (await params).handle.toLowerCase()

  if (!isLookupableHandle(handle)) {
    return Response.json({ error: "Profile not found." }, { status: 404 })
  }

  try {
    const profile = await getPublicProfile(handle)

    if (!profile) {
      return Response.json({ error: "Profile not found." }, { status: 404 })
    }

    return Response.json(
      { profile: toProfileView(profile) },
      { headers: { "Cache-Control": PROFILE_CACHE } }
    )
  } catch {
    return Response.json(
      { error: "Could not load that profile." },
      { status: 500 }
    )
  }
}
