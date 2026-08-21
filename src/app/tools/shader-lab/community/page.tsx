import type { Metadata } from "next"
import type { Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { cn } from "@/lib/cn"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"
import { COMMUNITY_PATH, communityTagPath } from "@/lib/community/scene-links"
import {
  CURATED_SCENE_TAGS,
  getSceneTagLabel,
  isCuratedSceneTag,
} from "@/lib/community/scene-tags"

const TITLE = "Made by the community"

const TAGLINE =
  "Every scene runs in your browser. Open one, change anything, make it yours."

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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-16)] px-4 py-10 sm:px-6">
      <header className="flex flex-col items-start gap-[var(--ds-space-5)] pt-[var(--ds-space-4)]">
        <Typography
          as="h1"
          className="max-w-[640px] text-balance"
          variant="display"
        >
          {TITLE}
        </Typography>
        <Typography
          as="p"
          className="max-w-[400px] text-pretty"
          tone="secondary"
          variant="title"
        >
          {TAGLINE}
        </Typography>
        <ButtonLink href="/tools/shader-lab" variant="primary">
          Open the editor
        </ButtonLink>
      </header>

      <Suspense fallback={<CommunityScenesSkeleton />}>
        <CommunityScenes searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function CommunityScenes({ searchParams }: PageProps) {
  const rawTag = (await searchParams).tag
  const tag = isCuratedSceneTag(rawTag) ? rawTag : undefined
  const page = await getPublicScenes(tag)

  return (
    <section className="flex flex-col gap-[var(--ds-space-6)]">
      <nav
        aria-label="Filter community scenes by tag"
        className="flex gap-2 overflow-x-auto"
      >
        <Link
          aria-current={tag ? undefined : "page"}
          className={cn(
            "shrink-0 rounded-[var(--ds-radius-control)] border px-3 py-1.5 transition-colors duration-160",
            tag
              ? "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)]"
              : "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
          )}
          href={COMMUNITY_PATH as Route}
        >
          <Typography as="span" variant="label">
            All
          </Typography>
        </Link>
        {CURATED_SCENE_TAGS.map((sceneTag) => (
          <Link
            aria-current={tag === sceneTag ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-[var(--ds-radius-control)] border px-3 py-1.5 transition-colors duration-160",
              tag === sceneTag
                ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
                : "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)]"
            )}
            href={communityTagPath(sceneTag) as Route}
            key={sceneTag}
          >
            <Typography as="span" variant="label">
              {getSceneTagLabel(sceneTag)}
            </Typography>
          </Link>
        ))}
      </nav>

      <PublicSceneGrid
        emptyLabel={
          tag
            ? `No ${getSceneTagLabel(tag)} scenes published yet.`
            : "No scenes published yet."
        }
        initialNextCursor={page.nextCursor}
        initialScenes={page.scenes}
        {...(tag ? { tag } : {})}
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
