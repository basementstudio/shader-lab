import { HeartIcon } from "@radix-ui/react-icons"
import type { Route } from "next"
import Link from "next/link"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { HeroBackdrop } from "@/components/community/hero-backdrop"
import { HeroScrollCue } from "@/components/community/hero-scroll-cue"
import { BasementWordmark } from "@/components/editor/made-by-basement"
import { Typography } from "@/components/ui/typography"
import type { HeroScene } from "@/lib/community/public-scenes"
import { scenePagePath } from "@/lib/community/scene-links"

export function CommunityHero({
  hero,
  title,
}: {
  hero: HeroScene | null
  title: string
}) {
  const detail = hero?.detail ?? null

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 sm:px-6">
      {detail ? (
        <HeroBackdrop
          hasCameraLayer={detail.layerTypes.includes("live")}
          labUrl={detail.labUrl}
          posterUrl={detail.thumbnailUrl}
        />
      ) : null}

      <div className="relative z-[1] flex flex-col items-center gap-[var(--ds-space-5)] text-center">
        <span className="text-[var(--ds-color-text-secondary)]">
          <BasementWordmark height={12} />
        </span>

        <h1 className="type-display m-0 text-balance text-[clamp(44px,8.5vw,104px)] leading-[0.92] tracking-[-0.04em]">
          Shader
          <br />
          Community
        </h1>

        <HeroScrollCue />
      </div>

      {detail ? (
        <Link
          className="absolute right-4 bottom-4 z-[1] inline-flex min-w-0 items-center gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[rgb(8_9_12_/_0.68)] px-2.5 py-1.5 backdrop-blur-[8px] transition-colors duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] sm:right-6"
          href={scenePagePath(detail.slug) as Route}
        >
          <Typography as="span" tone="tertiary" variant="monoXs">
            {hero && hero.recentLikes > 0 ? "Most liked today" : "Most liked"}
          </Typography>
          <span
            aria-hidden="true"
            className="h-2.5 w-px bg-[var(--ds-border-divider)]"
          />
          <AuthorAvatar
            avatarUrl={detail.authorAvatarUrl}
            name={detail.authorName ?? detail.authorHandle}
            size={16}
          />
          <Typography
            as="span"
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            variant="caption"
          >
            {detail.title}
          </Typography>
          <span className="inline-flex items-center gap-1 text-[var(--ds-color-text-tertiary)]">
            <HeartIcon height={11} width={11} />
            <Typography as="span" tone="tertiary" variant="monoXs">
              {detail.likeCount}
            </Typography>
          </span>
        </Link>
      ) : null}

      <span className="sr-only">{title}</span>
    </section>
  )
}
