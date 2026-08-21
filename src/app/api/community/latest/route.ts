import { isCommunityEnabled } from "@/lib/community/config"
import { getLatestPublishedAt } from "@/lib/community/scenes"

export async function GET() {
  if (!isCommunityEnabled()) {
    return Response.json({ publishedAt: null })
  }

  try {
    return Response.json(
      { publishedAt: await getLatestPublishedAt() },
      {
        headers: {
          // Reads no session, so the CDN can answer this for everyone. The
          // editor asks on every load; it must not become a database hit.
          "cache-control":
            "public, s-maxage=60, stale-while-revalidate=300, max-age=0",
        },
      }
    )
  } catch {
    return Response.json({ publishedAt: null })
  }
}
