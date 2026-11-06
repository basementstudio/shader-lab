import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CommunityHero } from "@/components/community/community-hero"
import { CommunityScenesBrowser } from "@/components/community/community-scenes-browser"
import { SceneGridSkeleton } from "@/components/community/public-scene-grid"
import { SCENES_ANCHOR_ID } from "@/components/community/scenes-anchor"
import { APP_BASE_URL, APP_OG_IMAGES } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getHeroScene, getPublicScenes } from "@/lib/community/public-scenes"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  scenePagePath,
} from "@/lib/community/scene-links"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import { generateCollectionPageSchema } from "@/lib/structured-data/schemas/collection"

const TITLE = "Made by the community"

const DESCRIPTION =
  "Scenes made with Shader Lab by the community. Open any one of them and remix it in your browser."

export const metadata: Metadata = {
  alternates: { canonical: COMMUNITY_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    images: APP_OG_IMAGES,
    title: "Community",
    type: "website",
    url: `${APP_BASE_URL}${COMMUNITY_PATH}`,
  },
  title: "Community",
}

export default function CommunityPage() {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <>
      <Suspense fallback={<CommunityHero hero={null} title={TITLE} />}>
        <CommunityHeroSection />
      </Suspense>

      <main
        className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-16)] px-4 pt-[var(--ds-space-10)] pb-16 sm:px-6"
        id={SCENES_ANCHOR_ID}
      >
        <Suspense fallback={<CommunityScenesSkeleton />}>
          <CommunityScenes />
        </Suspense>
      </main>
    </>
  )
}

async function CommunityHeroSection() {
  return <CommunityHero hero={await getHeroScene()} title={TITLE} />
}

async function CommunityScenes() {
  const page = await getPublicScenes()

  return (
    <section className="flex flex-col gap-[var(--ds-space-6)]">
      <PageJsonLd
        nodes={[
          generateCollectionPageSchema({
            description: DESCRIPTION,
            items: page.scenes.map((scene) => ({
              name: scene.title,
              path: scenePagePath(scene.slug),
            })),
            name: TITLE,
            path: COMMUNITY_PATH,
          }),
          generateBreadcrumbSchema([
            { name: "Shader Lab", path: EDITOR_PATH },
            { name: "Community", path: COMMUNITY_PATH },
          ]),
        ]}
      />
      <CommunityScenesBrowser
        initialNextCursor={page.nextCursor}
        initialScenes={page.scenes}
      />
    </section>
  )
}

function CommunityScenesSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-[var(--ds-space-6)]"
    >
      <div className="h-9 w-full rounded-group bg-[var(--ds-color-surface-control)]" />
      <SceneGridSkeleton />
    </section>
  )
}
