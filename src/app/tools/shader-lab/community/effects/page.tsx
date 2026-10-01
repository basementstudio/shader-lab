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
  "Every effect in Shader Lab. Open one to see what it does and the community scenes built with it."

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
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-[var(--ds-space-10)] px-4 pt-24 pb-16 sm:px-6">
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
                className="flex h-full flex-col gap-[var(--ds-space-3)] rounded-scene-card bg-[var(--ds-color-card)] p-bar pb-[var(--ds-space-4)] shadow-[var(--skin-card-shadow)] transition-[box-shadow,translate] duration-200 ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-panel-dark)]"
                href={effectPagePath(effect) as Route}
              >
                {entry.previewSrc ? (
                  <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-scene-thumb bg-[var(--ds-color-media)]">
                    <Image
                      alt={`${entry.label} effect example`}
                      className="object-cover"
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 380px"
                      src={entry.previewSrc}
                    />
                  </span>
                ) : null}
                <Typography as="h2" className="px-[var(--ds-space-3)] font-medium" variant="label">
                  {entry.label}
                </Typography>
                {entry.description ? (
                  <Typography
                    as="p"
                    className="px-[var(--ds-space-3)] text-pretty leading-[1.55]"
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
