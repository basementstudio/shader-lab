import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PublicSceneGrid } from "@/components/community/public-scene-grid"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"

const TITLE = "Shaders made by the community"

const DESCRIPTION =
  "Every scene here was built in Shader Lab and runs in real time. Open one, remix it, make it yours."

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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-6)] px-4 py-10 sm:px-6">
      <header className="flex max-w-[680px] flex-col items-start gap-[var(--ds-space-4)] pt-[var(--ds-space-4)]">
        <Typography as="h1" variant="display">
          {TITLE}
        </Typography>
        <Typography as="p" tone="secondary" variant="title">
          {DESCRIPTION}
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
