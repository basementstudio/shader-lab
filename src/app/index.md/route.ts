import { markdownResponse } from "@/lib/aeo/md-response"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import {
  ABOUT_PATH,
  COMMUNITY_PATH,
  EDITOR_PATH,
  PRIVACY_PATH,
} from "@/lib/community/scene-links"
import {
  getLayerLabel,
  LAYER_CATALOG,
} from "@/lib/editor/config/layer-catalog"
import { PRODUCT_FACTS } from "@/lib/structured-data/product-facts"
import { EFFECT_LAYER_TYPES, SOURCE_LAYER_TYPES } from "@/types/editor"

function effectLines(): string {
  return [...EFFECT_LAYER_TYPES]
    .sort((left, right) =>
      getLayerLabel(left).localeCompare(getLayerLabel(right))
    )
    .map((type) => {
      const entry = LAYER_CATALOG[type]

      return entry.description
        ? `- **${entry.label}** — ${entry.description}`
        : `- **${entry.label}**`
    })
    .join("\n")
}

/** Markdown product overview — the `.md` twin of the about page. */
export function GET() {
  const base = APP_BASE_URL
  const sources = SOURCE_LAYER_TYPES.map(getLayerLabel).join(", ")

  const body = `# Shader Lab

${PRODUCT_FACTS.description}

- Editor: ${base}${EDITOR_PATH}
- About & FAQ: ${base}${ABOUT_PATH}${
    isCommunityEnabled()
      ? `\n- Community gallery: ${base}${COMMUNITY_PATH}`
      : ""
  }
- Privacy: ${base}${PRIVACY_PATH}
- Content index: ${base}/sitemap.md

## How it works

A scene is a stack of layers. Source layers put something on the canvas (${sources}); effect layers transform everything below them and can be reordered, masked, blended, and animated on the timeline. The composition exports to video directly from the browser.

## Effects

${effectLines()}

## Packages

- [${PRODUCT_FACTS.packages[0].name}](${PRODUCT_FACTS.packages[0].npmUrl}) — ${PRODUCT_FACTS.packages[0].description}
- [${PRODUCT_FACTS.packages[1].name}](${PRODUCT_FACTS.packages[1].npmUrl}) — ${PRODUCT_FACTS.packages[1].description}
- Source: ${PRODUCT_FACTS.githubUrl}

## Contact

${PRODUCT_FACTS.contactEmail} — made by [${PRODUCT_FACTS.publisher.name}](${PRODUCT_FACTS.publisher.url}).
`

  return markdownResponse(body, ABOUT_PATH)
}
