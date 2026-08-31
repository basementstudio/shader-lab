import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  EFFECTS_PATH,
  effectPagePath,
} from "@/lib/community/scene-links"
import { getLayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import { generateCollectionPageSchema } from "@/lib/structured-data/schemas/collection"

const DESCRIPTION =
  "Every shader effect in Shader Lab — stack them on images, video, text, and 3D models, animate them on the timeline, and browse community scenes that use each one."

export const metadata: Metadata = {
  alternates: { canonical: EFFECTS_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    title: "Shader effects",
    type: "website",
    url: `${APP_BASE_URL}${EFFECTS_PATH}`,
  },
  title: "Shader effects",
}

export default function EffectsIndexPage() {
  if (!isCommunityEnabled()) {
    notFound()
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-10)] px-4 py-10 sm:px-6">
      <PageJsonLd
        nodes={[
          generateCollectionPageSchema({
            description: DESCRIPTION,
            items: COMMUNITY_EFFECT_TYPES.map((effect) => ({
              name: getLayerCatalogEntry(effect).label,
              path: effectPagePath(effect),
            })),
            name: "Shader effects",
            path: EFFECTS_PATH,
          }),
          generateBreadcrumbSchema([
            { name: "Shader Lab", path: EDITOR_PATH },
            { name: "Community", path: COMMUNITY_PATH },
            { name: "Effects", path: EFFECTS_PATH },
          ]),
        ]}
      />

      <header className="flex flex-col items-start gap-[var(--ds-space-4)]">
        <Link
          className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
          href={COMMUNITY_PATH as Route}
        >
          ← Community
        </Link>
        <Typography as="h1" className="text-balance" variant="display">
          Shader effects
        </Typography>
        <Typography
          as="p"
          className="max-w-[640px] text-pretty leading-[1.65]"
          tone="secondary"
          variant="title"
        >
          {DESCRIPTION}
        </Typography>
      </header>

      <ul className="grid list-none grid-cols-1 gap-[var(--ds-space-6)] p-0 sm:grid-cols-2 min-[1000px]:grid-cols-3">
        {COMMUNITY_EFFECT_TYPES.map((effect) => {
          const entry = getLayerCatalogEntry(effect)

          return (
            <li key={effect}>
              <Link
                className="flex flex-col gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
                href={effectPagePath(effect) as Route}
              >
                {entry.previewSrc ? (
                  <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
                    <Image
                      alt={`${entry.label} effect example`}
                      className="object-cover"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 380px"
                      src={entry.previewSrc}
                    />
                  </span>
                ) : null}
                <Typography as="h2" variant="label">
                  {entry.label}
                </Typography>
                {entry.description ? (
                  <Typography
                    as="p"
                    className="text-pretty leading-[1.55]"
                    tone="secondary"
                    variant="caption"
                  >
                    {entry.description}
                  </Typography>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
