import { NextResponse } from "next/server"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  ABOUT_PATH,
  COMMUNITY_PATH,
  EDITOR_PATH,
  EFFECTS_PATH,
  effectPagePath,
  PRIVACY_PATH,
} from "@/lib/community/scene-links"
import { getLayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import {
  getEffectNames,
  PRODUCT_FACTS,
} from "@/lib/structured-data/product-facts"

/**
 * llmstxt.org-format link map for AI assistants. A route handler rather than a
 * static file because absolute URLs derive from the runtime base URL and the
 * community section depends on deployment configuration.
 */
export function GET() {
  const base = APP_BASE_URL
  const communityEnabled = isCommunityEnabled()

  const keyPages = [
    `- [Editor](${base}${EDITOR_PATH}): The Shader Lab editor itself — start creating immediately, no account needed.`,
    `- [About](${base}${ABOUT_PATH}): What Shader Lab is, how the editor works, the full effect catalog, and an FAQ.`,
    ...(communityEnabled
      ? [
          `- [Community](${base}${COMMUNITY_PATH}): Gallery of published scenes — every one can be opened and remixed. Filterable by effect via ?effect=<name>.`,
          `- [Effects index](${base}${EFFECTS_PATH}): One landing page per effect, each with a description, example image, and the community scenes using it.`,
        ]
      : []),
    `- [Privacy policy](${base}${PRIVACY_PATH}): What Shader Lab stores, who processes it, and how to have it deleted.`,
  ]

  const body = `# Shader Lab

> ${PRODUCT_FACTS.description}

## Key pages

${keyPages.join("\n")}

## Effects

${
  communityEnabled
    ? COMMUNITY_EFFECT_TYPES.map((effect) => {
        const entry = getLayerCatalogEntry(effect)

        return `- [${entry.label}](${base}${effectPagePath(effect)})${entry.description ? `: ${entry.description}` : ""}`
      }).join("\n")
    : `${getEffectNames().join(", ")}.`
}

## Packages

- [${PRODUCT_FACTS.packages[0].name}](${PRODUCT_FACTS.packages[0].npmUrl}): ${PRODUCT_FACTS.packages[0].description}
- [${PRODUCT_FACTS.packages[1].name}](${PRODUCT_FACTS.packages[1].npmUrl}): ${PRODUCT_FACTS.packages[1].description}
- [GitHub](${PRODUCT_FACTS.githubUrl}): Source for the app and both packages.

## Markdown mirrors

- ${base}/index.md — product overview.
- ${base}/sitemap.md — content index.${
    communityEnabled
      ? `\n- Scene pages have markdown twins: append \`.md\` to a scene URL (also served via \`Accept: text/markdown\`).`
      : ""
  }

## Contact

- ${PRODUCT_FACTS.contactEmail}
- Made by ${PRODUCT_FACTS.publisher.name}: ${PRODUCT_FACTS.publisher.url}
`

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
