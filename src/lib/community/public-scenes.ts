import { isCommunityEnabled } from "@/lib/community/config"
import {
  decodeSceneCursor,
  type SceneCursor,
} from "@/lib/community/scene-cursor"
import {
  type CommunitySceneDetail,
  type CommunitySceneSummary,
  getPublishedScene,
  listPublishedScenes,
} from "@/lib/community/scenes"

export const PUBLIC_GRID_LIMIT = 48

export async function getPublicScenes(): Promise<{
  nextCursor: string | null
  scenes: CommunitySceneSummary[]
}> {
  "use cache"

  if (!isCommunityEnabled()) {
    return { nextCursor: null, scenes: [] }
  }

  try {
    return await listPublishedScenes({
      limit: PUBLIC_GRID_LIMIT,
      sort: "popular",
    })
  } catch {
    return { nextCursor: null, scenes: [] }
  }
}

const SITEMAP_PAGE_SIZE = 60

const SITEMAP_MAX_SCENES = 10_000

export interface SitemapScene {
  publishedAt: string | null
  slug: string
}

export async function listAllPublishedScenesForSitemap(): Promise<
  SitemapScene[]
> {
  "use cache"

  if (!isCommunityEnabled()) {
    return []
  }

  const collected: SitemapScene[] = []
  let cursor: SceneCursor | null = null

  try {
    while (collected.length < SITEMAP_MAX_SCENES) {
      const page = await listPublishedScenes({
        cursor,
        limit: SITEMAP_PAGE_SIZE,
        sort: "latest",
      })

      for (const scene of page.scenes) {
        collected.push({
          publishedAt: scene.publishedAt,
          slug: scene.slug,
        })
      }

      if (!page.nextCursor) {
        break
      }

      cursor = decodeSceneCursor(page.nextCursor)

      if (!cursor) {
        break
      }
    }
  } catch {
    return collected
  }

  return collected
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
