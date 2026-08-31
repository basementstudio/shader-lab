import { markdownResponse } from "@/lib/aeo/md-response"
import { mdText } from "@/lib/aeo/md-text"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { listAllProfilesForSitemap } from "@/lib/community/public-profiles"
import { listAllPublishedScenesForSitemap } from "@/lib/community/public-scenes"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  ABOUT_PATH,
  COMMUNITY_PATH,
  EDITOR_PATH,
  EFFECTS_PATH,
  effectPagePath,
  PRIVACY_PATH,
  profilePagePath,
  scenePagePath,
} from "@/lib/community/scene-links"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"

/** Markdown content index for AI agents — the `.md` twin of sitemap.xml. */
export async function GET() {
  const base = APP_BASE_URL

  const sections = [
    `# Shader Lab — Content Index

## Pages

- [Editor](${base}${EDITOR_PATH})
- [About](${base}${ABOUT_PATH})
- [Privacy policy](${base}${PRIVACY_PATH})

## Other resources

- [Product overview (markdown)](${base}/index.md)
- [llms.txt](${base}/llms.txt)
- [agents.md](${base}/agents.md)`,
  ]

  if (isCommunityEnabled()) {
    const scenes = await listAllPublishedScenesForSitemap()
    const profiles = await listAllProfilesForSitemap()

    sections.push(`## Community

- [Gallery](${base}${COMMUNITY_PATH})
- [Effects index](${base}${EFFECTS_PATH})`)

    sections.push(
      `## Effect pages\n\n${COMMUNITY_EFFECT_TYPES.map(
        (effect) =>
          `- [${getLayerLabel(effect)}](${base}${effectPagePath(effect)})`
      ).join("\n")}`
    )

    if (scenes.length > 0) {
      sections.push(
        `## Scenes\n\nEach scene also has a markdown twin at \`<url>.md\`.\n\n${scenes
          .map(
            (scene) =>
              `- [${mdText(scene.title)}](${base}${scenePagePath(scene.slug)})`
          )
          .join("\n")}`
      )
    }

    if (profiles.length > 0) {
      sections.push(
        `## Profiles\n\n${profiles
          .map(
            (profile) =>
              `- [@${profile.handle}](${base}${profilePagePath(profile.handle)})`
          )
          .join("\n")}`
      )
    }
  }

  return markdownResponse(`${sections.join("\n\n")}\n`)
}
