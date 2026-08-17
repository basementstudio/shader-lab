"use client"

import { useEffect, useState } from "react"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"

export function ProfileOwnerActions({ handle }: { handle: string }) {
  const { data: session } = authClient.useSession()
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    if (!session?.user) {
      setIsOwner(false)

      return
    }

    let cancelled = false

    fetch("/api/community/me/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { handle?: string } | null) => {
        if (!cancelled) {
          setIsOwner(data?.handle === handle)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsOwner(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [handle, session?.user])

  if (!isOwner) {
    return null
  }

  return (
    <span className="inline-flex w-fit items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)] px-2 py-[3px]">
      <Typography as="span" tone="secondary" variant="monoXs">
        This is you
      </Typography>
    </span>
  )
}
