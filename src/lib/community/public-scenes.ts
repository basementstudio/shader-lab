import { cacheLife, cacheTag } from "next/cache"
import {
  authorTag,
  COMMUNITY_FEED_TAG,
  sceneTag,
} from "@/lib/community/cache-tags"
import { isCommunityEnabled } from "@/lib/community/config"
import {
  decodeSceneCursor,
  type SceneCursor,
} from "@/lib/community/scene-cursor"
import {
  type CommunitySceneDetail,
  type CommunitySceneSummary,
  findHeroSceneSlug,
  getPublishedSceneWithAuthor,
  listPublishedScenes,
} from "@/lib/community/scenes"
import type { EffectLayerType } from "@/types/editor"

export const PUBLIC_GRID_LIMIT = 48

export async function getPublicScenes(
  effects: readonly EffectLayerType[] = []
): Promise<{
  nextCursor: string | null
  scenes: CommunitySceneSummary[]
}> {
  "use cache"

  cacheTag(COMMUNITY_FEED_TAG)

  if (!isCommunityEnabled()) {
    return { nextCursor: null, scenes: [] }
  }

  try {
    return await listPublishedScenes({
      limit: PUBLIC_GRID_LIMIT,
      sort: "popular",
      ...(effects.length > 0 ? { effects } : {}),
    })
  } catch {
    return { nextCursor: null, scenes: [] }
  }
}

export interface HeroScene {
  detail: CommunitySceneDetail
  recentLikes: number
}

export async function getHeroScene(): Promise<HeroScene | null> {
  "use cache"

  cacheLife("hours")
  cacheTag(COMMUNITY_FEED_TAG)

  if (!isCommunityEnabled()) {
    return null
  }

  try {
    const pick = await findHeroSceneSlug()

    if (!pick) {
      return null
    }

    const authored = await getPublishedSceneWithAuthor(pick.slug)

    if (!authored) {
      return null
    }

    cacheTag(sceneTag(pick.slug))

    return { detail: authored.detail, recentLikes: pick.recentLikes }
  } catch {
    return null
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

  cacheTag(COMMUNITY_FEED_TAG)

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

  cacheTag(sceneTag(slug))

  if (!isCommunityEnabled()) {
    return null
  }

  try {
    const authored = await getPublishedSceneWithAuthor(slug)

    if (!authored) {
      return null
    }

    cacheTag(authorTag(authored.authorId))

    return authored.detail
  } catch {
    return null
  }
}
