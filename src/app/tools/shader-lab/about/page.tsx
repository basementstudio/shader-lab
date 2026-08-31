import type { Metadata, Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  ABOUT_PATH,
  COMMUNITY_PATH,
  EDITOR_PATH,
  effectPagePath,
  PRIVACY_PATH,
} from "@/lib/community/scene-links"
import { LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { PRODUCT_FACTS } from "@/lib/structured-data/product-facts"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import {
  type FaqItem,
  generateFaqPageSchema,
} from "@/lib/structured-data/schemas/faq"
import { generateWebApplicationSchema } from "@/lib/structured-data/schemas/web-application"

const DESCRIPTION =
  "What Shader Lab is, how the layer-based WebGPU editor works, every effect in the catalog, and answers to common questions."

export const metadata: Metadata = {
  alternates: { canonical: ABOUT_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    title: "About",
    type: "website",
    url: `${APP_BASE_URL}${ABOUT_PATH}`,
  },
  title: "About",
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Shader Lab free?",
    answer:
      "Yes. Shader Lab is free to use in the browser, and the runtime and MCP packages are open source. There is no paid tier.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. You can use the whole editor without signing in — your work autosaves into your browser's own IndexedDB storage and nothing is sent to a server. An account (Google or GitHub) is only needed to save drafts to the cloud or publish scenes to the community gallery.",
  },
  {
    question: "What browsers does it work in?",
    answer:
      "Shader Lab runs on WebGPU, so it needs a browser with WebGPU enabled — recent versions of Chrome and Edge on desktop, and current Safari and Firefox releases.",
  },
  {
    question: "Can I use a scene on my own website?",
    answer:
      "Yes. The @basementstudio/shader-lab npm package is a portable React/WebGPU runtime that renders exported Shader Lab scenes inside any React app.",
  },
  {
    question: "Can AI agents drive the editor?",
    answer:
      "Yes. The @basementstudio/shader-lab-mcp package is an MCP server that lets an agent like Claude Code control a running editor tab — adding and tweaking layers, writing custom TSL shaders with real compile feedback, and taking canvas screenshots. Open the editor with ?agent=1 to connect.",
  },
  {
    question: "What does remixing mean?",
    answer:
      "Every published scene in the community gallery can be opened in the editor and remixed into a new scene. Remixes keep a lineage credit that links back to the original scene and its author.",
  },
]

interface Section {
  body: string[]
  heading: string
}

const SECTIONS: Section[] = [
  {
    heading: "What it is",
    body: [
      PRODUCT_FACTS.description,
      "Shader Lab is built and operated by basement.studio, the design and engineering studio behind the Geist typeface and websites for companies like Vercel and ElevenLabs.",
    ],
  },
  {
    heading: "How it works",
    body: [
      "A scene is a stack of layers. Source layers put something on the canvas — an image, a video, your camera, text, a mesh gradient, or a 3D model. Effect layers transform everything below them, and they stack: a video under a pixelation pass under a CRT pass renders exactly in that order, in real time.",
      "Every layer parameter can be animated on the timeline, and the whole composition exports to video directly from the browser.",
      "There is also a custom shader layer: write TSL (three.js Shading Language) in a sandbox that compiles in the browser and shows you compile errors immediately.",
    ],
  },
]

export default function AboutPage() {
  const communityEnabled = isCommunityEnabled()

  return (
    <main className="mx-auto w-full max-w-[840px] px-5 py-[var(--ds-space-16)] sm:px-6">
      <PageJsonLd
        nodes={[
          generateWebApplicationSchema(),
          generateFaqPageSchema(FAQ_ITEMS, ABOUT_PATH),
          generateBreadcrumbSchema([
            { name: "Shader Lab", path: EDITOR_PATH },
            { name: "About", path: ABOUT_PATH },
          ]),
        ]}
      />

      <header className="flex flex-col items-start gap-[var(--ds-space-4)]">
        <Link
          className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
          href={EDITOR_PATH}
        >
          ← Shader Lab
        </Link>
        <Typography as="h1" variant="display">
          About Shader Lab
        </Typography>
        <Typography
          as="p"
          className="text-pretty leading-[1.65]"
          tone="secondary"
          variant="body"
        >
          A free, browser-based editor for stacking and animating shader effects
          — by{" "}
          <Link
            className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
            href={PRODUCT_FACTS.publisher.url}
          >
            basement.studio
          </Link>
          .
        </Typography>
      </header>

      <hr className="my-[var(--ds-space-10)] border-0 border-[var(--ds-border-divider)] border-t" />

      <div className="flex flex-col gap-[var(--ds-space-12)]">
        {SECTIONS.map((section) => (
          <section
            className="flex flex-col gap-[var(--ds-space-4)]"
            key={section.heading}
          >
            <Typography as="h2" variant="heading">
              {section.heading}
            </Typography>
            {section.body.map((paragraph) => (
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                key={paragraph}
                tone="secondary"
                variant="body"
              >
                {paragraph}
              </Typography>
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-[var(--ds-space-6)]">
          <div className="flex flex-col gap-[var(--ds-space-4)]">
            <Typography as="h2" variant="heading">
              The effect catalog
            </Typography>
            <Typography
              as="p"
              className="text-pretty leading-[1.65]"
              tone="secondary"
              variant="body"
            >
              Every effect below can be stacked on any source, reordered,
              masked, blended, and animated on the timeline.
            </Typography>
          </div>

          <ul className="grid list-none grid-cols-1 gap-[var(--ds-space-6)] p-0 sm:grid-cols-2">
            {COMMUNITY_EFFECT_TYPES.map((type) => {
              const entry = LAYER_CATALOG[type]

              return (
                <li
                  className="flex flex-col gap-[var(--ds-space-2)]"
                  key={type}
                >
                  {entry.previewSrc ? (
                    <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
                      <Image
                        alt={`${entry.label} effect example`}
                        className="object-cover"
                        fill
                        sizes="(max-width: 640px) 100vw, 420px"
                        src={entry.previewSrc}
                      />
                    </span>
                  ) : null}
                  <Typography as="h3" variant="label">
                    {communityEnabled ? (
                      <Link
                        className="transition-opacity duration-160 hover:opacity-75"
                        href={effectPagePath(type) as Route}
                      >
                        {entry.label}
                      </Link>
                    ) : (
                      entry.label
                    )}
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
                </li>
              )
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-[var(--ds-space-4)]">
          <Typography as="h2" variant="heading">
            Use it outside the editor
          </Typography>
          {PRODUCT_FACTS.packages.map((pkg) => (
            <div
              className="flex flex-col gap-[var(--ds-space-2)]"
              key={pkg.name}
            >
              <Typography as="h3" variant="label">
                <Link
                  className="underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
                  href={pkg.npmUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {pkg.name}
                </Link>
              </Typography>
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                tone="secondary"
                variant="body"
              >
                {pkg.description}
              </Typography>
            </div>
          ))}
          <Typography
            as="p"
            className="text-pretty leading-[1.65]"
            tone="secondary"
            variant="body"
          >
            Both packages and the whole app are open source on{" "}
            <Link
              className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
              href={PRODUCT_FACTS.githubUrl}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </Link>
            .
          </Typography>
        </section>

        {communityEnabled ? (
          <section className="flex flex-col gap-[var(--ds-space-4)]">
            <Typography as="h2" variant="heading">
              The community gallery
            </Typography>
            <Typography
              as="p"
              className="text-pretty leading-[1.65]"
              tone="secondary"
              variant="body"
            >
              Publishing a scene puts it in the{" "}
              <Link
                className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
                href={COMMUNITY_PATH as Route}
              >
                community gallery
              </Link>
              , where anyone can open it, like it, and remix it into their own
              scene. Remixes credit the original scene and author through a
              lineage link.
            </Typography>
          </section>
        ) : null}

        <section className="flex flex-col gap-[var(--ds-space-4)]">
          <Typography as="h2" variant="heading">
            Frequently asked questions
          </Typography>
          <div className="flex flex-col gap-[var(--ds-space-8)]">
            {FAQ_ITEMS.map((faq) => (
              <div
                className="flex flex-col gap-[var(--ds-space-2)]"
                key={faq.question}
              >
                <Typography as="h3" variant="label">
                  {faq.question}
                </Typography>
                <Typography
                  as="p"
                  className="text-pretty leading-[1.65]"
                  tone="secondary"
                  variant="body"
                >
                  {faq.answer}
                </Typography>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap gap-[var(--ds-space-4)]">
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={EDITOR_PATH}
          >
            Open the editor
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={PRIVACY_PATH}
          >
            Privacy policy
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={`mailto:${PRODUCT_FACTS.contactEmail}`}
          >
            {PRODUCT_FACTS.contactEmail}
          </Link>
        </footer>
      </div>
    </main>
  )
}
