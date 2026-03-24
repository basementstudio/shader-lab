import type { MetadataRoute } from "next"
import { APP_BASE_URL } from "@/lib/app"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [],
    },
    sitemap: `${APP_BASE_URL}/sitemap.xml`,
  }
}
