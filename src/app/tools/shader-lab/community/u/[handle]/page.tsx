import type { Metadata, Route } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { ProfileHeader } from "@/components/community/profile-header"
import { ProfileOwnerActions } from "@/components/community/profile-owner-actions"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { SCENE_GRID_CLASS_NAME } from "@/components/community/scene-grid"
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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-5)] px-4 pt-24 pb-16 sm:px-6">
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
      <div className="rounded-[var(--ds-radius-panel)] bg-[var(--ds-color-card)] p-[var(--ds-space-6)] shadow-[var(--skin-card-shadow)] sm:p-[var(--ds-space-8)]">
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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-5)] px-4 pt-24 pb-16 sm:px-6">
      <div className="h-[220px] w-full animate-pulse rounded-[var(--ds-radius-panel)] bg-[var(--ds-color-card)]" />

      <GridSkeleton />
    </main>
  )
}

const SKELETON_CARDS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const

function GridSkeleton() {
  return (
    <div className={SCENE_GRID_CLASS_NAME}>
      {SKELETON_CARDS.map((id) => (
        <div
          className="aspect-[16/11] w-full animate-pulse rounded-toolbar bg-[var(--ds-color-card)]"
          key={id}
        />
      ))}
    </div>
  )
}
