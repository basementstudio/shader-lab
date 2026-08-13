"use client"

import { TriangleDownIcon, TriangleUpIcon } from "@radix-ui/react-icons"
import { useState } from "react"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/cn"

export function UpvoteButton({
  count,
  onChange,
  slug,
  upvoted,
}: {
  count: number
  onChange: (next: { count: number; upvoted: boolean }) => void
  slug: string
  upvoted: boolean
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
      count: Math.max(count + (upvoted ? -1 : 1), 0),
      upvoted: !upvoted,
    }

    onChange(optimistic)

    try {
      const res = await fetch(`/api/community/scenes/${slug}/like`, {
        method: "POST",
      })

      if (!res.ok) {
        onChange({ count, upvoted })
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
        upvoted: data.liked ?? optimistic.upvoted,
      })
    } catch {
      onChange({ count, upvoted })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      aria-label={upvoted ? "Remove upvote" : "Upvote this scene"}
      aria-pressed={upvoted}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-radius-control)] border px-2.5 transition-[background-color,border-color,color,opacity] duration-160 ease-[var(--ease-out-cubic)]",
        upvoted
          ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
          : "border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)]",
        signedIn
          ? "cursor-pointer hover:not-disabled:border-[var(--ds-border-hover)]"
          : "cursor-not-allowed opacity-45"
      )}
      disabled={!signedIn}
      onClick={() => void toggle()}
      title={signedIn ? undefined : "Sign in to upvote"}
      type="button"
    >
      {upvoted ? (
        <TriangleDownIcon height={12} width={12} />
      ) : (
        <TriangleUpIcon height={12} width={12} />
      )}
      <Typography as="span" variant="monoXs">
        {count}
      </Typography>
    </button>
  )
}
