import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"

const TITLE = "Made by the community"

const TAGLINE =
  "Every scene runs in your browser. Open one, change anything, make it yours."

const DESCRIPTION =
  "Scenes made with Shader Lab by the community. Open any one of them and remix it in your browser."

export const metadata: Metadata = {
  alternates: { canonical: "/community" },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    title: "Community",
    type: "website",
    url: `${APP_BASE_URL}/community`,
  },
  title: "Community",
}

export default async function CommunityPage() {
  if (!isCommunityEnabled()) {
    notFound()
  }

  const page = await getPublicScenes()

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

      <PublicSceneGrid
        initialNextCursor={page.nextCursor}
        initialScenes={page.scenes}
      />
    </main>
  )
}
