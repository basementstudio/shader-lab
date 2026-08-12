import { isCommunityEnabled } from "@/lib/community/config"
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
