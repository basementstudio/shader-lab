import { APP_BASE_URL } from "@/lib/app"
import { getCommunitySceneEffects } from "@/lib/community/scene-effect-filter"
import { profilePagePath, scenePagePath } from "@/lib/community/scene-links"
import type { CommunitySceneDetail } from "@/lib/community/scenes"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { WEB_APPLICATION_ID } from "@/lib/structured-data/schemas/web-application"

/** `description` is the page's resolved copy (scene description or fallback). */
export function generateSceneSchema(
  scene: CommunitySceneDetail,
  description: string
) {
  const url = `${APP_BASE_URL}${scenePagePath(scene.slug)}`
  const authorName = scene.authorName ?? `@${scene.authorHandle}`
  const effects = getCommunitySceneEffects(scene.layerTypes).map(getLayerLabel)

  return {
    "@type": "CreativeWork",
    "@id": `${url}#work`,
    name: scene.title,
    url,
    description,
    ...(scene.thumbnailUrl ? { image: scene.thumbnailUrl } : {}),
    ...(scene.publishedAt ? { datePublished: scene.publishedAt } : {}),
    ...(effects.length > 0 ? { keywords: effects.join(", ") } : {}),
    author: {
      "@type": "Person",
      name: authorName,
      url: `${APP_BASE_URL}${profilePagePath(scene.authorHandle)}`,
    },
    ...(scene.forkedFrom
      ? { isBasedOn: `${APP_BASE_URL}${scenePagePath(scene.forkedFrom.slug)}` }
      : {}),
    isPartOf: { "@id": WEB_APPLICATION_ID },
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: { "@type": "LikeAction" },
        userInteractionCount: scene.likeCount,
      },
      // Remixes: each one is a new scene created from this one.
      {
        "@type": "InteractionCounter",
        interactionType: { "@type": "CreateAction" },
        userInteractionCount: scene.remixCount,
      },
    ],
  }
}
