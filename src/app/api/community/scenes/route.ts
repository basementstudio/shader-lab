import { isCommunityEnabled } from "@/lib/community/config"
import { type SceneSort, SCENE_SORTS, listPublishedScenes } from "@/lib/community/scenes"

function parseSort(value: string | null): SceneSort {
  return SCENE_SORTS.includes(value as SceneSort) ? (value as SceneSort) : "latest"
}

export async function GET(request: Request) {
  if (!isCommunityEnabled()) {
    return Response.json({ scenes: [] }, { status: 200 })
  }

  const url = new URL(request.url)
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10)

  try {
    const items = await listPublishedScenes({
      ...(Number.isFinite(limit) ? { limit } : {}),
      sort: parseSort(url.searchParams.get("sort")),
    })

    return Response.json({ scenes: items })
  } catch {
    return Response.json({ error: "Could not load scenes." }, { status: 500 })
  }
}
