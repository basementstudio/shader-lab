import { cacheTag } from "next/cache"
import {
  authorTag,
  COMMUNITY_FEED_TAG,
  profileHandleTag,
} from "@/lib/community/cache-tags"
import { isCommunityEnabled } from "@/lib/community/config"
import {
  findCurrentHandleFor,
  getProfileByHandle,
  listProfilesForSitemap,
  type PublicProfile,
  type SitemapProfile,
} from "@/lib/community/profiles"
import { listPublishedScenes, type SceneListPage } from "@/lib/community/scenes"

export const PROFILE_GRID_LIMIT = 24

export async function getPublicProfile(
  handle: string
): Promise<PublicProfile | null> {
  "use cache"

  cacheTag(profileHandleTag(handle))

  if (!isCommunityEnabled()) {
    return null
  }

  try {
    const profile = await getProfileByHandle(handle)

    if (!profile) {
      return null
    }

    cacheTag(authorTag(profile.userId))

    return profile
  } catch {
    return null
  }
}

export async function getPublicProfileScenes(
  handle: string
): Promise<SceneListPage> {
  "use cache"

  cacheTag(profileHandleTag(handle))
  cacheTag(COMMUNITY_FEED_TAG)

  if (!isCommunityEnabled()) {
    return { nextCursor: null, scenes: [] }
  }

  try {
    return await listPublishedScenes({
      authorHandle: handle,
      limit: PROFILE_GRID_LIMIT,
      sort: "latest",
    })
  } catch {
    return { nextCursor: null, scenes: [] }
  }
}

export async function resolveHandleRedirect(
  handle: string
): Promise<string | null> {
  "use cache"

  cacheTag(profileHandleTag(handle))

  if (!isCommunityEnabled()) {
    return null
  }

  try {
    return await findCurrentHandleFor(handle)
  } catch {
    return null
  }
}

export async function listAllProfilesForSitemap(): Promise<SitemapProfile[]> {
  "use cache"

  cacheTag(COMMUNITY_FEED_TAG)

  if (!isCommunityEnabled()) {
    return []
  }

  try {
    return await listProfilesForSitemap()
  } catch {
    return []
  }
}
