import { HeartIcon } from "@radix-ui/react-icons";
import type { Route } from "next";
import Link from "next/link";
import { AuthorAvatar } from "@/components/community/author-avatar";
import { HeroBackdrop } from "@/components/community/hero-backdrop";
import { BasementWordmark } from "@/components/editor/made-by-basement";
import { Typography } from "@/components/ui/typography";
import type { HeroScene } from "@/lib/community/public-scenes";
import { scenePagePath } from "@/lib/community/scene-links";

export function CommunityHero({
  hero,
  title,
}: {
  hero: HeroScene | null;
  title: string;
}) {
  const detail = hero?.detail ?? null;

  return (
    <section className="px-[var(--ds-space-2)] pt-[var(--ds-space-2)]">
      <div className="ds-on-media relative flex min-h-[84svh] flex-col justify-end overflow-hidden rounded-[var(--ds-radius-panel)] bg-[var(--ds-color-media)] px-[var(--ds-space-6)] pt-[var(--ds-space-16)] pb-[var(--ds-space-6)] shadow-[var(--skin-card-shadow)] sm:px-[var(--ds-space-8)] sm:pb-[var(--ds-space-8)]">
        {detail ? (
          <HeroBackdrop
            hasCameraLayer={detail.layerTypes.includes("live")}
            labUrl={detail.labUrl}
            posterUrl={detail.thumbnailUrl}
          />
        ) : null}

        <div className="relative z-[1] flex w-full flex-col gap-[var(--ds-space-8)] lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col items-start gap-[var(--ds-space-4)]">
            <span className="ml-2 text-[var(--ds-color-text-secondary)]">
              <BasementWordmark height={12} />
            </span>

            <h1 className="type-display m-0 text-balance text-left text-[clamp(44px,8.5vw,80px)] leading-[0.85] tracking-[-0.04em]">
              Made By <br /> The Community
            </h1>
          </div>

          {detail ? (
            <Link
              className="inline-flex min-w-0 max-w-full items-center gap-[var(--ds-space-2)] self-start rounded-toolbar border border-[var(--ds-border-divider)] bg-[var(--ds-color-media-glass)] p-bar pr-[var(--ds-space-3)] backdrop-blur-[8px] transition-colors duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] lg:self-end"
              href={scenePagePath(detail.slug) as Route}
            >
              <AuthorAvatar
                avatarUrl={detail.authorAvatarUrl}
                name={detail.authorName ?? detail.authorHandle}
                size={28}
              />
              <span className="flex min-w-0 flex-col">
                <Typography as="span" tone="secondary" variant="caption">
                  {hero && hero.recentLikes > 0
                    ? "Most liked today"
                    : "Most liked"}
                </Typography>
                <Typography
                  as="span"
                  className="overflow-hidden text-ellipsis whitespace-nowrap"
                  variant="label"
                >
                  {detail.title}
                </Typography>
              </span>
              <span className="ml-[var(--ds-space-2)] inline-flex items-center gap-1 text-[var(--ds-color-text-secondary)]">
                <HeartIcon height={13} width={13} />
                <Typography as="span" tone="inherit" variant="label">
                  {detail.likeCount}
                </Typography>
              </span>
            </Link>
          ) : null}
        </div>
        <span className="sr-only">{title}</span>
      </div>
    </section>
  );
}
