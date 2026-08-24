import { HeartIcon, ShuffleIcon } from "@radix-ui/react-icons"
import type { Route } from "next"
import Image from "next/image"
import Link from "next/link"
import { AuthorLink } from "@/components/community/author-link"
import { HeroScenePreview } from "@/components/community/hero-scene-preview"
import { ButtonLink } from "@/components/ui/button/link"
import { Typography } from "@/components/ui/typography"
import type { HeroScene } from "@/lib/community/public-scenes"
import { editorSceneHref, scenePagePath } from "@/lib/community/scene-links"

export function CommunityHero({
  hero,
  tagline,
  title,
}: {
  hero: HeroScene | null
  tagline: string
  title: string
}) {
  return (
    <header className="flex flex-col gap-[var(--ds-space-8)] pt-[var(--ds-space-4)] min-[900px]:grid min-[900px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] min-[900px]:items-center min-[900px]:gap-[var(--ds-space-10)]">
      <div className="flex flex-col items-start gap-[var(--ds-space-5)]">
        <Typography
          as="h1"
          className="max-w-[640px] text-balance"
          variant="display"
        >
          {title}
        </Typography>
        <Typography
          as="p"
          className="max-w-[400px] text-pretty"
          tone="secondary"
          variant="title"
        >
          {tagline}
        </Typography>
        <ButtonLink href="/tools/shader-lab" variant="primary">
          Open the editor
        </ButtonLink>
      </div>

      {hero ? <HeroFeature hero={hero} /> : null}
    </header>
  )
}

function HeroFeature({ hero }: { hero: HeroScene }) {
  const { detail, recentLikes } = hero
  const label = recentLikes > 0 ? "Most liked today" : "Most liked"

  return (
    <figure className="m-0 flex flex-col gap-[var(--ds-space-3)]">
      <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)]">
        {detail.thumbnailUrl ? (
          <Image
            alt={detail.title}
            className="object-cover"
            fill
            priority
            sizes="(max-width: 900px) 92vw, 660px"
            src={detail.thumbnailUrl}
          />
        ) : null}

        <HeroScenePreview
          hasCameraLayer={detail.layerTypes.includes("live")}
          labUrl={detail.labUrl}
        />

        <div className="pointer-events-none absolute top-2.5 left-2.5 z-[2] inline-flex items-center rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-2 py-1 backdrop-blur-[8px]">
          <Typography as="span" tone="secondary" variant="overline">
            {label}
          </Typography>
        </div>

        <Link
          aria-label={`Open ${detail.title}`}
          className="absolute inset-0 z-[3] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--ds-border-active)] focus-visible:outline-offset-2"
          href={scenePagePath(detail.slug) as Route}
        />

        <div className="pointer-events-none absolute right-2.5 bottom-2.5 z-[4] opacity-0 transition-opacity duration-160 ease-[var(--ease-out-cubic)] group-focus-within:opacity-100 group-hover:opacity-100">
          <ButtonLink
            className="pointer-events-auto border border-white/10 bg-[rgb(8_9_12_/_0.68)] backdrop-blur-[8px]"
            href={editorSceneHref(detail.slug) as Route}
            size="compact"
            variant="secondary"
          >
            <ShuffleIcon height={13} width={13} />
            Remix
          </ButtonLink>
        </div>
      </div>

      <figcaption className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--ds-space-3)]">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Link
            className="min-w-0 rounded-[var(--ds-radius-control)] transition-opacity duration-160 hover:opacity-80"
            href={scenePagePath(detail.slug) as Route}
          >
            <Typography
              as="span"
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              variant="label"
            >
              {detail.title}
            </Typography>
          </Link>
          <AuthorLink
            avatarUrl={detail.authorAvatarUrl}
            handle={detail.authorHandle}
            name={detail.authorName}
          />
        </div>

        <div className="inline-flex shrink-0 items-center gap-[var(--ds-space-3)]">
          <span className="inline-flex items-center gap-1 text-[var(--ds-color-text-secondary)]">
            <HeartIcon height={12} width={12} />
            <Typography as="span" tone="secondary" variant="monoXs">
              {detail.likeCount}
            </Typography>
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--ds-color-text-secondary)]">
            <ShuffleIcon height={12} width={12} />
            <Typography as="span" tone="secondary" variant="monoXs">
              {detail.remixCount}
            </Typography>
          </span>
        </div>
      </figcaption>
    </figure>
  )
}
