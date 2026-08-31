import type { MetadataRoute } from "next"
import { APP_BASE_URL, isProductionDeployment } from "@/lib/app"

const DISALLOW = ["/api/", "/auth/", "/monitoring"]

/**
 * AI crawlers and assistants are explicitly allowed — LLM answer engines are a
 * first-class discovery channel for Shader Lab (see `/llms.txt`, `/agents.md`
 * and the markdown mirrors in `src/middleware.ts`). Several of these bots only
 * honor a rule group that names them, so relying on `*` is not enough.
 */
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
]

export default function robots(): MetadataRoute.Robots {
  if (!isProductionDeployment()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    }
  }

  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: `${APP_BASE_URL}/sitemap.xml`,
    host: APP_BASE_URL,
  }
}
