import type { MetadataRoute } from "next"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { listAllProfilesForSitemap } from "@/lib/community/public-profiles"
import { listAllPublishedScenesForSitemap } from "@/lib/community/public-scenes"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  PRIVACY_PATH,
  profilePagePath,
  scenePagePath,
} from "@/lib/community/scene-links"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${APP_BASE_URL}${EDITOR_PATH}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${APP_BASE_URL}${PRIVACY_PATH}`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ]

  if (!isCommunityEnabled()) {
    return entries
  }

  const scenes = await listAllPublishedScenesForSitemap()

  entries.push({
    url: `${APP_BASE_URL}${COMMUNITY_PATH}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  })

  for (const scene of scenes) {
    entries.push({
      url: `${APP_BASE_URL}${scenePagePath(scene.slug)}`,
      lastModified: scene.publishedAt
        ? new Date(scene.publishedAt)
        : new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    })
  }

  for (const profile of await listAllProfilesForSitemap()) {
    entries.push({
      url: `${APP_BASE_URL}${profilePagePath(profile.handle)}`,
      lastModified: profile.lastPublishedAt
        ? new Date(profile.lastPublishedAt)
        : new Date(),
      changeFrequency: "weekly",
      priority: 0.4,
    })
  }

  return entries
}
