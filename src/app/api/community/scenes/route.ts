import { isCommunityEnabled } from "@/lib/community/config"
import { isLookupableHandle } from "@/lib/community/handle"
import { decodeSceneCursor } from "@/lib/community/scene-cursor"
import {
  DEFAULT_SCENE_SORT,
  listPublishedScenes,
  SCENE_SORTS,
  type SceneSort,
} from "@/lib/community/scenes"

const FIRST_PAGE_CACHE =
  "public, s-maxage=60, stale-while-revalidate=300, max-age=0"

function parseSort(value: string | null): SceneSort {
  return SCENE_SORTS.includes(value as SceneSort)
    ? (value as SceneSort)
    : DEFAULT_SCENE_SORT
}

export async function GET(request: Request) {
  if (!isCommunityEnabled()) {
    return Response.json({ nextCursor: null, scenes: [] }, { status: 200 })
  }

  const url = new URL(request.url)
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10)
  const rawCursor = url.searchParams.get("cursor")

  const requestedAuthor = url.searchParams.get("author")?.toLowerCase() ?? ""

  if (requestedAuthor.length > 0 && !isLookupableHandle(requestedAuthor)) {
    return Response.json({ nextCursor: null, scenes: [] }, { status: 200 })
  }

  try {
    const query = url.searchParams.get("q")?.slice(0, 80) ?? ""
    const page = await listPublishedScenes({
      ...(requestedAuthor.length > 0 ? { authorHandle: requestedAuthor } : {}),
      cursor: decodeSceneCursor(rawCursor),
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(query.trim().length > 0 ? { query } : {}),
      sort: parseSort(url.searchParams.get("sort")),
    })

    const cacheable = !(rawCursor || query.trim().length > 0)

    return Response.json(
      page,
      cacheable ? { headers: { "Cache-Control": FIRST_PAGE_CACHE } } : {}
    )
  } catch {
    return Response.json({ error: "Could not load scenes." }, { status: 500 })
  }
}
