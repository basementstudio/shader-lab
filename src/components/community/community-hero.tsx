import type { Route } from "next";
import Link from "next/link";
import { AuthorAvatar } from "@/components/community/author-avatar";
import { LucideHeartIcon } from "@/components/community/lucide-heart-icon";
import { StatNumber } from "@/components/community/stat-number";
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
            <HeroSceneCard
              detail={detail}
              today={Boolean(hero && hero.recentLikes > 0)}
            />
          ) : null}
        </div>
        <span className="sr-only">{title}</span>
      </div>
    </section>
  );
}

function HeroSceneCard({
  detail,
  today,
}: {
  detail: HeroScene["detail"];
  today: boolean;
}) {
  const author = detail.authorName ?? `@${detail.authorHandle}`;

  return (
    <Link
      aria-label={`${today ? "Most liked today" : "Most liked"}: ${detail.title} by ${author}, ${detail.likeCount} likes`}
      className="group relative flex w-full min-w-0 max-w-[var(--ds-size-hero-card)] shrink-0 self-start transition-[translate] duration-200 ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 lg:self-end"
      href={scenePagePath(detail.slug) as Route}
    >
      <span className="ds-stat ds-stat-compact flex min-h-[var(--ds-size-hero-card-min-height)] w-full min-w-0 flex-col justify-between gap-[var(--ds-space-3)] rounded-toolbar border border-[var(--ds-border-divider)] bg-[var(--ds-color-media-glass)] p-[var(--ds-space-4)] backdrop-blur-[16px] transition-[border-color] duration-200 ease-[var(--ease-out-cubic)] group-hover:border-[var(--ds-border-hover)]">
        <StatNumber share="58cqw" value={detail.likeCount} />

        <span className="relative z-[1] flex min-w-0 flex-col gap-[var(--ds-space-1)] pr-[var(--ds-space-6)]">
          <Typography as="span" tone="secondary" variant="caption">
            {today ? "Most liked today" : "Most liked"}
          </Typography>
          <span
            className="type-display line-clamp-2 text-[length:var(--ds-text-quote)] leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere]"
            title={detail.title}
          >
            {`\u201c${detail.title}\u201d`}
          </span>
        </span>

        <span className="relative z-[1] flex min-w-0 max-w-[var(--ds-hero-card-text-share)] items-center gap-[var(--ds-space-2)]">
          <AuthorAvatar
            avatarUrl={detail.authorAvatarUrl}
            name={author}
            size={16}
          />
          <Typography as="span" className="truncate font-semibold" variant="caption">
            {author}
          </Typography>
        </span>
      </span>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[var(--ds-space-2)] -right-[var(--ds-space-2)] z-[2] inline-flex size-[var(--ds-size-icon-button)] rotate-[10deg] items-center justify-center rounded-full bg-[var(--ds-color-accent)] text-white shadow-[var(--ds-shadow-raised)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:rotate-0"
      >
        <LucideHeartIcon size={14} />
      </span>
    </Link>
  );
}
