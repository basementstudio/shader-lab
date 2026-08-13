import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { RemixCredit } from "@/components/community/remix-credit"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { lineageLabel } from "@/lib/community/lineage"
import { getPublicScene } from "@/lib/community/public-scenes"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"

type PageProps = { params: Promise<{ slug: string }> }

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

export default function CommunityScenePage({ params }: PageProps) {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <Suspense fallback={<SceneSkeleton />}>
      <SceneBody params={params} />
    </Suspense>
  )
}

function SceneSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-5)] px-4 py-10 sm:px-6">
      <div className="grid grid-cols-1 gap-[var(--ds-space-5)] min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex animate-pulse flex-col gap-[var(--ds-space-3)]">
          <div className="h-6 w-2/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
          <div className="h-10 w-4/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
          <div className="h-4 w-3/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
        </div>
        <div className="aspect-[16/10] w-full animate-pulse rounded-[10px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-5)] px-4 py-10 sm:px-6">
      <Link
        className="w-fit underline decoration-dotted underline-offset-2"
        href="/community"
      >
        <Typography as="span" tone="tertiary" variant="caption">
          All scenes
        </Typography>
      </Link>

      <div className="grid grid-cols-1 gap-[var(--ds-space-5)] min-[860px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex min-w-0 flex-col gap-[var(--ds-space-4)]">
          <div className="flex min-w-0 items-center gap-[var(--ds-space-2)]">
            <AuthorAvatar
              avatarUrl={scene.authorAvatarUrl}
              name={authorName}
              size={24}
            />
            <div className="flex min-w-0 flex-col">
              <Typography as="span" variant="label">
                {authorName}
              </Typography>
              {publishedAt ? (
                <Typography as="span" tone="tertiary" variant="monoXs">
                  {publishedAt}
                </Typography>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-[var(--ds-space-2)]">
            <Typography as="h1" variant="heading">
              {scene.title}
            </Typography>
            {scene.description ? (
              <Typography as="p" tone="secondary" variant="body">
                {scene.description}
              </Typography>
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

          {scene.forkedFrom ? (
            <Link
              aria-label={lineageLabel(scene.forkedFrom)}
              className="w-fit rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
              href={`/community/${scene.forkedFrom.slug}` as Route}
              title={scene.forkedFrom.title}
            >
              <RemixCredit lineage={scene.forkedFrom} />
            </Link>
          ) : null}

          <div className="flex flex-wrap items-center gap-[var(--ds-space-3)]">
            <Link
              className="inline-flex h-9 items-center rounded-[var(--ds-radius-control)] bg-white px-4 text-black transition-opacity duration-160 hover:opacity-90"
              href={`/tools/shader-lab?scene=${scene.slug}`}
            >
              <Typography as="span" tone="onLight" variant="label">
                Remix in Shader Lab
              </Typography>
            </Link>

            <Typography as="span" tone="tertiary" variant="monoXs">
              {scene.likeCount} upvotes · {scene.remixCount} remixes
            </Typography>
          </div>
        </div>

        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
          {scene.thumbnailUrl ? (
            <Image
              alt={scene.title}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 860px) 100vw, 660px"
              src={scene.thumbnailUrl}
            />
          ) : null}
        </div>
      </div>
    </main>
  )
}
