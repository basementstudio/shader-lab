import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CommunityHero } from "@/components/community/community-hero"
import { SCENES_ANCHOR_ID } from "@/components/community/scenes-anchor"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { PublicSceneEffectFilter } from "@/components/community/public-scene-effect-filter"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getHeroScene, getPublicScenes } from "@/lib/community/public-scenes"
import { getCommunityEffectSelection } from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  scenePagePath,
} from "@/lib/community/scene-links"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
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
    title: "Community",
    type: "website",
    url: `${APP_BASE_URL}${COMMUNITY_PATH}`,
  },
  title: "Community",
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function CommunityPage({ searchParams }: PageProps) {
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
          <CommunityScenes searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  )
}

async function CommunityHeroSection() {
  return <CommunityHero hero={await getHeroScene()} title={TITLE} />
}

async function CommunityScenes({ searchParams }: PageProps) {
  const effects = getCommunityEffectSelection((await searchParams).effect)
  const page = await getPublicScenes(effects)
  let emptyLabel = "No scenes published yet."

  if (effects.length === 1) {
    emptyLabel = `No scenes using ${getLayerLabel(effects[0]!)} published yet.`
  } else if (effects.length > 1) {
    emptyLabel = "No scenes use all selected effects yet."
  }

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
      <div className="flex items-center gap-2">
        <Typography as="span" tone="tertiary" variant="overline">
          Effect
        </Typography>
        <PublicSceneEffectFilter effects={effects} />
      </div>

      <PublicSceneGrid
        emptyLabel={emptyLabel}
        initialNextCursor={page.nextCursor}
        initialScenes={page.scenes}
        effects={effects}
      />
    </section>
  )
}

const COMMUNITY_SKELETON_KEYS = ["one", "two", "three", "four", "five", "six"]

function CommunityScenesSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-[var(--ds-space-6)]"
    >
      <div className="h-8 w-full max-w-[720px] rounded-[var(--ds-radius-control)] bg-[var(--ds-color-surface-subtle)]" />
      <div className="grid grid-cols-1 gap-[var(--ds-space-5)] min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3">
        {COMMUNITY_SKELETON_KEYS.map((key) => (
          <div
            className="aspect-[16/10] rounded-[12px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]"
            key={key}
          />
        ))}
      </div>
    </section>
  )
}
