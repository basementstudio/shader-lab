import { isCommunityEnabled } from "@/lib/community/config"
import {
  type CommunitySceneDetail,
  type CommunitySceneSummary,
  getPublishedScene,
  listPublishedScenes,
} from "@/lib/community/scenes"

export const PUBLIC_GRID_LIMIT = 48

export async function getPublicScenes(): Promise<CommunitySceneSummary[]> {
  "use cache"

  if (!isCommunityEnabled()) {
    return []
  }

  try {
    const page = await listPublishedScenes({
      limit: PUBLIC_GRID_LIMIT,
      sort: "popular",
    })

    return page.scenes
  } catch {
    return []
  }
}

export async function getPublicScene(
  slug: string
): Promise<CommunitySceneDetail | null> {
  "use cache"

  if (!isCommunityEnabled()) {
    return null
  }

  try {
    return await getPublishedScene(slug)
  } catch {
    return null
  }
}
