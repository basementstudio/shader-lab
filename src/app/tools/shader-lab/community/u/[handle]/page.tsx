import type { Metadata, Route } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { ProfileHeader } from "@/components/community/profile-header"
import { ProfileOwnerActions } from "@/components/community/profile-owner-actions"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { SCENE_GRID_CLASS_NAME } from "@/components/community/scene-grid"
import { ButtonLink } from "@/components/ui/button/link"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { isLookupableHandle } from "@/lib/community/handle"
import {
  getPublicProfile,
  getPublicProfileScenes,
  resolveHandleRedirect,
} from "@/lib/community/public-profiles"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  profilePagePath,
} from "@/lib/community/scene-links"
import type { PublicProfile } from "@/lib/community/profiles"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import { generateProfilePageSchema } from "@/lib/structured-data/schemas/profile-page"

type PageProps = { params: Promise<{ handle: string }> }

function describe(profile: PublicProfile): string {
  const label = profile.displayName ?? `@${profile.handle}`
  const count = profile.publishedCount

  if (count === 0) {
    return `${label} on Shader Lab.`
  }

  return `${count} ${count === 1 ? "scene" : "scenes"} published by ${label} on Shader Lab. Open any one of them and remix it in your browser.`
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const handle = (await params).handle.toLowerCase()
  const profile = isLookupableHandle(handle)
    ? await getPublicProfile(handle)
    : null

  if (!profile) {
    return {
      robots: { follow: false, index: false },
      title: "Profile not found",
    }
  }

  const label = profile.displayName ?? `@${profile.handle}`
  const description = describe(profile)

  return {
    alternates: { canonical: profilePagePath(profile.handle) },
    description,
    openGraph: {
      description,
      title: label,
      type: "profile",
      url: `${APP_BASE_URL}${profilePagePath(profile.handle)}`,
    },
    ...(profile.publishedCount === 0
      ? { robots: { follow: true, index: false } }
      : {}),
    title: label,
    twitter: { card: "summary_large_image", description, title: label },
  }
}

export default function ProfilePage({ params }: PageProps) {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileRoute params={params} />
    </Suspense>
  )
}

async function ProfileRoute({ params }: PageProps) {
  const requested = (await params).handle
  const handle = requested.toLowerCase()

  if (requested !== handle) {
    redirect(profilePagePath(handle) as Route)
  }

  if (!isLookupableHandle(handle)) {
    notFound()
  }

  const profile = await getPublicProfile(handle)

  if (!profile) {
    const current = await resolveHandleRedirect(handle)

    if (current) {
      redirect(profilePagePath(current) as Route)
    }

    notFound()
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-6)] px-4 py-10 sm:px-6">
      {/* Zero-scene profiles are noindexed; keep structured data consistent. */}
      {profile.publishedCount > 0 ? (
        <PageJsonLd
          nodes={[
            generateProfilePageSchema(profile),
            generateBreadcrumbSchema([
              { name: "Shader Lab", path: EDITOR_PATH },
              { name: "Community", path: COMMUNITY_PATH },
              {
                name: profile.displayName ?? `@${profile.handle}`,
                path: profilePagePath(profile.handle),
              },
            ]),
          ]}
        />
      ) : null}
      <div className="flex flex-col gap-[var(--ds-space-3)]">
        <ButtonLink
          className="w-fit px-0"
          href={COMMUNITY_PATH as Route}
          size="compact"
          variant="ghost"
        >
          All scenes
        </ButtonLink>

        <ProfileHeader
          action={<ProfileOwnerActions handle={profile.handle} />}
          profile={profile}
          scale="page"
        />
      </div>

      <Suspense fallback={<GridSkeleton />}>
        <ProfileScenes
          handle={profile.handle}
          label={profile.displayName ?? `@${profile.handle}`}
        />
      </Suspense>
    </main>
  )
}

async function ProfileScenes({
  handle,
  label,
}: {
  handle: string
  label: string
}) {
  const page = await getPublicProfileScenes(handle)

  return (
    <PublicSceneGrid
      author={handle}
      emptyLabel={`${label} has not published a scene yet.`}
      initialNextCursor={page.nextCursor}
      initialScenes={page.scenes}
      showAuthor={false}
      sort="latest"
    />
  )
}

function ProfileSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-6)] px-4 py-10 sm:px-6">
      <div className="flex animate-pulse items-center gap-[var(--ds-space-3)]">
        <div className="size-[56px] shrink-0 rounded-full bg-[var(--ds-color-surface-subtle)]" />
        <div className="flex flex-col gap-[var(--ds-space-2)]">
          <div className="h-7 w-[220px] rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
          <div className="h-3 w-[160px] rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
        </div>
      </div>

      <GridSkeleton />
    </main>
  )
}

const SKELETON_CARDS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const

function GridSkeleton() {
  return (
    <div className={SCENE_GRID_CLASS_NAME}>
      {SKELETON_CARDS.map((id) => (
        <div className="flex animate-pulse flex-col gap-[5px]" key={id}>
          <div className="flex flex-col gap-[var(--ds-space-2)]">
            <div className="aspect-[16/10] w-full rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
            <div className="h-4 w-3/5 rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
          </div>
        </div>
      ))}
    </div>
  )
}
