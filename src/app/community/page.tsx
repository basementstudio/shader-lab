import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PublicSceneCard } from "@/components/community/public-scene-card"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { getPublicScenes } from "@/lib/community/public-scenes"

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

  const scenes = await getPublicScenes()

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-6)] px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-[var(--ds-space-2)]">
        <Typography as="h1" variant="heading">
          Community
        </Typography>
        <Typography as="p" tone="secondary" variant="body">
          {DESCRIPTION}
        </Typography>
        <Link
          className="w-fit underline decoration-dotted underline-offset-2"
          href="/tools/shader-lab"
        >
          <Typography as="span" tone="tertiary" variant="caption">
            Open the editor
          </Typography>
        </Link>
      </header>

      {scenes.length === 0 ? (
        <Typography as="p" tone="tertiary" variant="caption">
          No scenes published yet.
        </Typography>
      ) : (
        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[760px]:grid-cols-4">
          {scenes.map((scene) => (
            <PublicSceneCard key={scene.slug} scene={scene} />
          ))}
        </div>
      )}
    </main>
  )
}
