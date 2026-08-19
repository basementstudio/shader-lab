import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { OpenInEditor } from "@/components/community/open-in-editor"
import { PublicSceneCard } from "@/components/community/public-scene-card"
import { RemixCredit } from "@/components/community/remix-credit"
import { SCENE_GRID_CLASS_NAME } from "@/components/community/scene-grid"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { lineageLabel } from "@/lib/community/lineage"
import {
  editorSceneHref,
  OPEN_IN_EDITOR_PARAM,
  profilePagePath,
} from "@/lib/community/scene-links"
import { getPublicProfileScenes } from "@/lib/community/public-profiles"
import { getPublicScene } from "@/lib/community/public-scenes"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { countLabel } from "@/lib/plural"

type PageProps = { params: Promise<{ slug: string }> }

type RouteProps = PageProps & {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function describe(input: {
  authorName: string
  description: string | null
  title: string
}): string {
  return (
    input.description?.trim() ||
    `${input.title} — a Shader Lab scene by ${input.authorName}. Open it and remix it in your browser.`
  )
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const scene = await getPublicScene(slug)

  if (!scene) {
    return { robots: { follow: false, index: false }, title: "Scene not found" }
  }

  const authorName = scene.authorName ?? `@${scene.authorHandle}`
  const description = describe({
    authorName,
    description: scene.description,
    title: scene.title,
  })

  return {
    alternates: { canonical: `/community/${scene.slug}` },
    description,
    openGraph: {
      description,
      title: scene.title,
      type: "article",
      url: `${APP_BASE_URL}/community/${scene.slug}`,
    },
    title: scene.title,
    twitter: { card: "summary_large_image", description, title: scene.title },
  }
}

export default function CommunityScenePage({
  params,
  searchParams,
}: RouteProps) {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <Suspense fallback={<SceneBoot />}>
      <SceneRoute params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function SceneRoute({ params, searchParams }: RouteProps) {
  if ((await searchParams)[OPEN_IN_EDITOR_PARAM] === "1") {
    return <OpenInEditor slug={(await params).slug} />
  }

  return (
    <Suspense fallback={<SceneSkeleton />}>
      <SceneBody params={params} />
    </Suspense>
  )
}

function SceneBoot() {
  return <div aria-hidden="true" className="fixed inset-0 bg-[#050507]" />
}

function SceneSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-16)] px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-[var(--ds-space-6)]">
        <div className="h-7 w-24 animate-pulse rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
        <div className="aspect-[16/10] w-full animate-pulse rounded-[12px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
      </div>

      <div className="flex animate-pulse flex-col gap-[var(--ds-space-3)]">
        <div className="h-12 w-2/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
        <div className="h-5 w-3/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
      </div>
    </main>
  )
}

async function SceneBody({ params }: PageProps) {
  const { slug } = await params
  const scene = await getPublicScene(slug)

  if (!scene) {
    notFound()
  }

  const authorName = scene.authorName ?? `@${scene.authorHandle}`
  const publishedAt = scene.publishedAt
    ? new Date(scene.publishedAt).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-16)] px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-[var(--ds-space-6)]">
        <ButtonLink
          className="w-fit px-0"
          href="/community"
          size="compact"
          variant="ghost"
        >
          All scenes
        </ButtonLink>

        <figure className="relative m-0 aspect-[16/10] w-full overflow-hidden rounded-[12px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
          {scene.thumbnailUrl ? (
            <Image
              alt={scene.title}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1220px) 100vw, 1180px"
              src={scene.thumbnailUrl}
            />
          ) : null}
        </figure>
      </div>

      <div className="grid grid-cols-1 gap-[var(--ds-space-8)] min-[860px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-[var(--ds-space-5)]">
          <div className="flex flex-col gap-[var(--ds-space-3)]">
            <Typography as="h1" className="text-balance" variant="display">
              {scene.title}
            </Typography>
            {scene.description ? (
              <Typography
                as="p"
                className="max-w-[560px] text-pretty"
                tone="secondary"
                variant="title"
              >
                {scene.description}
              </Typography>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-[var(--ds-space-5)]">
            <Link
              className="inline-flex min-w-0 items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
              href={profilePagePath(scene.authorHandle) as Route}
            >
              <AuthorAvatar
                avatarUrl={scene.authorAvatarUrl}
                name={authorName}
                size={32}
              />
              <span className="flex min-w-0 flex-col">
                <Typography as="span" variant="label">
                  {authorName}
                </Typography>
                {publishedAt ? (
                  <Typography as="span" tone="secondary" variant="monoXs">
                    {publishedAt}
                  </Typography>
                ) : null}
              </span>
            </Link>

            {scene.forkedFrom ? (
              <Link
                aria-label={lineageLabel(scene.forkedFrom)}
                className="rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
                href={`/community/${scene.forkedFrom.slug}` as Route}
                title={scene.forkedFrom.title}
              >
                <RemixCredit lineage={scene.forkedFrom} />
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {scene.layerTypes.map((type) => (
              <span
                className="inline-flex min-h-6 items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] px-2"
                key={type}
              >
                <Typography as="span" tone="secondary" variant="monoXs">
                  {getLayerLabel(type)}
                </Typography>
              </span>
            ))}
            {scene.hasCustomShader ? (
              <span className="inline-flex min-h-6 items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] px-2">
                <Typography as="span" variant="monoXs">
                  Custom shader
                </Typography>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-[var(--ds-space-3)] min-[860px]:items-end">
          <ButtonLink
            href={editorSceneHref(scene.slug) as Route}
            variant="primary"
          >
            Remix in Shader Lab
          </ButtonLink>
          <Typography as="span" tone="secondary" variant="monoSm">
            {countLabel(scene.likeCount, "upvote")} ·{" "}
            {countLabel(scene.remixCount, "remix")}
          </Typography>
        </div>
      </div>

      <Suspense fallback={null}>
        <MoreByAuthor
          authorHandle={scene.authorHandle}
          authorName={authorName}
          slug={scene.slug}
        />
      </Suspense>
    </main>
  )
}

const MORE_BY_AUTHOR_LIMIT = 6

async function MoreByAuthor({
  authorHandle,
  authorName,
  slug,
}: {
  authorHandle: string
  authorName: string
  slug: string
}) {
  const page = await getPublicProfileScenes(authorHandle)
  const scenes = page.scenes
    .filter((scene) => scene.slug !== slug)
    .slice(0, MORE_BY_AUTHOR_LIMIT)

  if (scenes.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-[var(--ds-space-6)]">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--ds-space-3)]">
        <Typography as="h2" variant="heading">
          More by {authorName}
        </Typography>
        <ButtonLink
          className="px-0"
          href={profilePagePath(authorHandle) as Route}
          size="compact"
          variant="ghost"
        >
          View profile
        </ButtonLink>
      </div>

      <div className={SCENE_GRID_CLASS_NAME}>
        {scenes.map((scene) => (
          <PublicSceneCard key={scene.slug} scene={scene} />
        ))}
      </div>
    </section>
  )
}
