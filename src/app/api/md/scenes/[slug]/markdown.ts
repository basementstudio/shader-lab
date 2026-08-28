import { APP_BASE_URL } from "@/lib/app"
import { getCommunitySceneEffects } from "@/lib/community/scene-effect-filter"
import {
  editorSceneHref,
  profilePagePath,
  scenePagePath,
} from "@/lib/community/scene-links"
import type { CommunitySceneDetail } from "@/lib/community/scenes"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { countLabel } from "@/lib/plural"

export function buildSceneMarkdown(scene: CommunitySceneDetail): string {
  const base = APP_BASE_URL
  const authorName = scene.authorName ?? `@${scene.authorHandle}`
  const effects = getCommunitySceneEffects(scene.layerTypes).map(getLayerLabel)
  const publishedAt = scene.publishedAt
    ? new Date(scene.publishedAt).toISOString().slice(0, 10)
    : null

  const facts = [
    `- Author: [${authorName}](${base}${profilePagePath(scene.authorHandle)})`,
    ...(publishedAt ? [`- Published: ${publishedAt}`] : []),
    `- ${countLabel(scene.likeCount, "like")}, ${countLabel(scene.remixCount, "remix")}`,
    ...(effects.length > 0 ? [`- Effects: ${effects.join(", ")}`] : []),
    ...(scene.forkedFrom
      ? [
          `- Remixed from: [${scene.forkedFrom.title}](${base}${scenePagePath(scene.forkedFrom.slug)}) by ${scene.forkedFrom.authorName ?? `@${scene.forkedFrom.authorHandle}`}`,
        ]
      : []),
  ]

  return `# ${scene.title}

A Shader Lab scene by ${authorName}.

${scene.description ? `${scene.description}\n\n` : ""}${facts.join("\n")}

## Links

- [Scene page](${base}${scenePagePath(scene.slug)})
- [Open and remix in the editor](${base}${editorSceneHref(scene.slug)})${
    scene.thumbnailUrl ? `\n- [Thumbnail](${scene.thumbnailUrl})` : ""
  }
`
}
