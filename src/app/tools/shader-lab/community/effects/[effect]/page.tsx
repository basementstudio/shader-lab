import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { Suspense } from "react"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { SceneTag } from "@/components/community/scene-tag"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"
import {
  COMMUNITY_EFFECT_TYPES,
  DISCONTINUED_EFFECT_REPLACEMENT,
  isCommunityEffectType,
  isDiscontinuedEffectType,
} from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  communityEffectPath,
  EDITOR_PATH,
  EFFECTS_PATH,
  effectPagePath,
  scenePagePath,
} from "@/lib/community/scene-links"
import {
  getLayerCatalogEntry,
  getLayerLabel,
} from "@/lib/editor/config/layer-catalog"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import { generateCollectionPageSchema } from "@/lib/structured-data/schemas/collection"
import type { EffectLayerType } from "@/types/editor"

type PageProps = { params: Promise<{ effect: string }> }

function describeEffect(effect: EffectLayerType): string {
  const entry = getLayerCatalogEntry(effect)

  return entry.description ?? `The ${entry.label} effect in Shader Lab.`
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { effect } = await params

  if (!isCommunityEffectType(effect)) {
    return {
      robots: { follow: false, index: false },
      title: "Effect not found",
    }
  }

  const entry = getLayerCatalogEntry(effect)
  const title = `${entry.label} shader effect`
  const description = describeEffect(effect)

  return {
    alternates: { canonical: effectPagePath(effect) },
    description,
    openGraph: {
      description,
      title,
      type: "website",
      url: `${APP_BASE_URL}${effectPagePath(effect)}`,
      ...(entry.previewSrc ? { images: [{ url: entry.previewSrc }] } : {}),
    },
    title,
    twitter: { card: "summary_large_image", description, title },
  }
}

// Sync wrapper: with cacheComponents, `params` must be awaited inside a
// Suspense boundary or the PPR shell prerender fails the build.
export default function EffectPage({ params }: PageProps) {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <Suspense fallback={<EffectSkeleton />}>
      <EffectRoute params={params} />
    </Suspense>
  )
}

function EffectSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] animate-pulse flex-col px-4 pt-24 pb-16 sm:px-6">
      <div className="grid grid-cols-1 gap-bar rounded-[var(--ds-radius-banner)] bg-[var(--ds-color-card)] p-bar min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="min-h-[240px]" />
        <div className="aspect-[16/10] w-full rounded-[var(--ds-radius-card)] bg-[var(--ds-color-media)]" />
      </div>
    </main>
  )
}

async function EffectRoute({ params }: PageProps) {
  const { effect } = await params

  if (isDiscontinuedEffectType(effect)) {
    permanentRedirect(effectPagePath(DISCONTINUED_EFFECT_REPLACEMENT) as Route)
  }

  if (!isCommunityEffectType(effect)) {
    notFound()
  }

  const entry = getLayerCatalogEntry(effect)
  const otherEffects = COMMUNITY_EFFECT_TYPES.filter(
    (other) => other !== effect
  )

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-16)] px-4 pt-24 pb-16 sm:px-6">
      <header className="grid grid-cols-1 gap-bar rounded-[var(--ds-radius-banner)] bg-[var(--ds-color-card)] p-bar shadow-[var(--skin-card-shadow)] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--ds-space-8)] p-[var(--ds-space-5)] sm:p-[var(--ds-space-6)]">
          <div className="flex flex-1 flex-col justify-center gap-[var(--ds-space-3)]">
            <Typography
              as="h1"
              className="text-balance [overflow-wrap:anywhere]"
              variant="display"
            >
              {entry.label}
              <span className="sr-only"> shader effect</span>
            </Typography>
            <Typography
              as="p"
              className="max-w-[520px] text-pretty leading-[1.6]"
              tone="secondary"
              variant="body"
            >
              {describeEffect(effect)}
            </Typography>
          </div>

          <div className="flex flex-wrap items-stretch gap-[var(--ds-space-2)]">
            <ButtonLink href={EDITOR_PATH as Route} variant="primary">
              Try it in the editor
            </ButtonLink>
            <ButtonLink
              href={communityEffectPath(effect) as Route}
              variant="secondary"
            >
              Filter the gallery
            </ButtonLink>
          </div>
        </div>

        <figure className="relative m-0 aspect-[16/10] w-full overflow-hidden rounded-[var(--ds-radius-card)] bg-[var(--ds-color-media)]">
          {entry.previewSrc ? (
            <Image
              alt={`${entry.label} effect example`}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 680px"
              src={entry.previewSrc}
            />
          ) : null}
        </figure>
      </header>

      <section className="flex flex-col gap-[var(--ds-space-5)]">
        <Typography as="h2" className="px-[var(--ds-space-1)]" variant="heading">
          Scenes using {entry.label}
        </Typography>
        <Suspense fallback={null}>
          <EffectScenes effect={effect} label={entry.label} />
        </Suspense>
      </section>

      <nav
        aria-label="Other effects"
        className="flex flex-col gap-[var(--ds-space-5)] rounded-[var(--ds-radius-banner)] bg-[var(--ds-color-card)] p-[var(--ds-space-6)] shadow-[var(--skin-card-shadow)]"
      >
        <Typography as="h2" variant="heading">
          Other effects
        </Typography>
        <div className="flex flex-wrap gap-[var(--ds-space-1_5)]">
          {otherEffects.map((other) => (
            <Link
              className="rounded-[var(--ds-radius-pill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-color-accent)]"
              href={effectPagePath(other) as Route}
              key={other}
            >
              <SceneTag>{getLayerLabel(other)}</SceneTag>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}

async function EffectScenes({
  effect,
  label,
}: {
  effect: EffectLayerType
  label: string
}) {
  const page = await getPublicScenes([effect])

  return (
    <>
      <PageJsonLd
        nodes={[
          generateCollectionPageSchema({
            description: describeEffect(effect),
            items: page.scenes.map((scene) => ({
              name: scene.title,
              path: scenePagePath(scene.slug),
            })),
            name: `${label} shader effect`,
            path: effectPagePath(effect),
          }),
          generateBreadcrumbSchema([
            { name: "Shader Lab", path: EDITOR_PATH },
            { name: "Community", path: COMMUNITY_PATH },
            { name: "Effects", path: EFFECTS_PATH },
            { name: label, path: effectPagePath(effect) },
          ]),
        ]}
      />
      <PublicSceneGrid
        effects={[effect]}
        emptyLabel={`No scenes using ${label} published yet — be the first.`}
        initialNextCursor={page.nextCursor}
        initialScenes={page.scenes}
      />
    </>
  )
}
