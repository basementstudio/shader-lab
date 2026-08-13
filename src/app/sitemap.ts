import type { MetadataRoute } from "next"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${APP_BASE_URL}/tools/shader-lab`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ]

  if (!isCommunityEnabled()) {
    return entries
  }

  const scenes = await getPublicScenes()

  entries.push({
    url: `${APP_BASE_URL}/community`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  })

  for (const scene of scenes) {
    entries.push({
      url: `${APP_BASE_URL}/community/${scene.slug}`,
      lastModified: scene.publishedAt
        ? new Date(scene.publishedAt)
        : new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    })
  }

  return entries
}
