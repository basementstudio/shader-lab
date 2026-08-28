import { APP_BASE_URL } from "@/lib/app"
import type { PublicProfile } from "@/lib/community/profiles"
import { profilePagePath } from "@/lib/community/scene-links"

export function generateProfilePageSchema(profile: PublicProfile) {
  const url = `${APP_BASE_URL}${profilePagePath(profile.handle)}`

  return {
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    dateCreated: profile.joinedAt,
    mainEntity: {
      "@type": "Person",
      name: profile.displayName ?? `@${profile.handle}`,
      alternateName: `@${profile.handle}`,
      url,
      ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
      // Performed: scenes published. Received: likes across those scenes.
      agentInteractionStatistic: {
        "@type": "InteractionCounter",
        interactionType: { "@type": "WriteAction" },
        userInteractionCount: profile.publishedCount,
      },
      interactionStatistic: {
        "@type": "InteractionCounter",
        interactionType: { "@type": "LikeAction" },
        userInteractionCount: profile.upvoteCount,
      },
    },
  }
}
