"use client"

import { HeartFilledIcon, HeartIcon } from "@radix-ui/react-icons"
import { useState } from "react"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/cn"

export function LikeButton({
  count,
  liked,
  onChange,
  slug,
}: {
  count: number
  onChange: (next: { count: number; liked: boolean }) => void
  slug: string
  liked: boolean
}) {
  const { data: session } = authClient.useSession()
  const [pending, setPending] = useState(false)
  const signedIn = Boolean(session?.user)

  const toggle = async () => {
    if (!signedIn || pending) {
      return
    }

    setPending(true)

    const optimistic = {
      count: Math.max(count + (liked ? -1 : 1), 0),
      liked: !liked,
    }

    onChange(optimistic)

    try {
      const res = await fetch(`/api/community/scenes/${slug}/like`, {
        method: "POST",
      })

      if (!res.ok) {
        onChange({ count, liked })
        return
      }

      const data = (await res.json()) as {
        likeCount?: number
        liked?: boolean
      }

      onChange({
        count:
          typeof data.likeCount === "number"
            ? data.likeCount
            : optimistic.count,
        liked: data.liked ?? optimistic.liked,
      })
    } catch {
      onChange({ count, liked })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      aria-label={liked ? "Remove like" : "Like this scene"}
      aria-pressed={liked}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-radius-control)] border px-2.5 transition-[background-color,border-color,color,opacity] duration-160 ease-[var(--ease-out-cubic)]",
        liked
          ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
          : "border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)]",
        signedIn
          ? "cursor-pointer hover:not-disabled:border-[var(--ds-border-hover)]"
          : "cursor-not-allowed opacity-45"
      )}
      disabled={!signedIn}
      onClick={() => void toggle()}
      title={signedIn ? undefined : "Sign in to like"}
      type="button"
    >
      {liked ? (
        <HeartFilledIcon height={12} width={12} />
      ) : (
        <HeartIcon height={12} width={12} />
      )}
      <Typography as="span" variant="monoXs">
        {count}
      </Typography>
    </button>
  )
}
