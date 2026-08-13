import { isCommunityEnabled } from "@/lib/community/config"
import {
  DEFAULT_SCENE_SORT,
  listPublishedScenes,
  SCENE_SORTS,
  type SceneSort,
} from "@/lib/community/scenes"

function parseSort(value: string | null): SceneSort {
  return SCENE_SORTS.includes(value as SceneSort)
    ? (value as SceneSort)
    : DEFAULT_SCENE_SORT
}

export async function GET(request: Request) {
  if (!isCommunityEnabled()) {
    return Response.json({ scenes: [] }, { status: 200 })
  }

  const url = new URL(request.url)
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10)

  try {
    const query = url.searchParams.get("q")?.slice(0, 80) ?? ""
    const items = await listPublishedScenes({
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(query.trim().length > 0 ? { query } : {}),
      sort: parseSort(url.searchParams.get("sort")),
    })

    return Response.json({ scenes: items })
  } catch {
    return Response.json({ error: "Could not load scenes." }, { status: 500 })
  }
}
