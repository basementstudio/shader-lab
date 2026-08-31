import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
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
  isCommunityEffectType,
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
  const lead =
    entry.description ??
    `Apply the ${entry.label} effect to images, video, text, and 3D models.`

  return `${lead} Use ${entry.label} free in your browser with Shader Lab, stack it with other effects, animate it on the timeline, and remix community scenes that use it.`
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

export default async function EffectPage({ params }: PageProps) {
  if (!isCommunityEnabled()) {
    notFound()
  }

  const { effect } = await params

  if (!isCommunityEffectType(effect)) {
    notFound()
  }

  const entry = getLayerCatalogEntry(effect)
  const otherEffects = COMMUNITY_EFFECT_TYPES.filter(
    (other) => other !== effect
  )

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-12)] px-4 py-10 sm:px-6">
      <header className="flex flex-col items-start gap-[var(--ds-space-5)]">
        <Link
          className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
          href={EFFECTS_PATH as Route}
        >
          ← All effects
        </Link>

        <div className="flex flex-col gap-[var(--ds-space-3)]">
          <Typography as="h1" className="text-balance" variant="display">
            {entry.label} shader effect
          </Typography>
          <Typography
            as="p"
            className="max-w-[640px] text-pretty leading-[1.65]"
            tone="secondary"
            variant="title"
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
            variant="ghost"
          >
            Filter the gallery
          </ButtonLink>
        </div>

        {entry.previewSrc ? (
          <figure className="relative m-0 aspect-[16/10] w-full max-w-[720px] overflow-hidden rounded-[12px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
            <Image
              alt={`${entry.label} effect example`}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 780px) 100vw, 720px"
              src={entry.previewSrc}
            />
          </figure>
        ) : null}
      </header>

      <section className="flex flex-col gap-[var(--ds-space-6)]">
        <Typography as="h2" variant="heading">
          Scenes using {entry.label}
        </Typography>
        <Suspense fallback={null}>
          <EffectScenes effect={effect} label={entry.label} />
        </Suspense>
      </section>

      <nav
        aria-label="Other effects"
        className="flex flex-col gap-[var(--ds-space-4)]"
      >
        <Typography as="h2" variant="heading">
          Other effects
        </Typography>
        <div className="flex flex-wrap gap-1.5">
          {otherEffects.map((other) => (
            <Link
              className="rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-75"
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
