"use client"

import { useEffect } from "react"
import { Typography } from "@/components/ui/typography"
import { AUTH_RETURN_TO_KEY } from "@/lib/auth/sign-in"

function resolveReturnTo(): string {
  try {
    const stored = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)

    window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY)

    if (stored?.startsWith("/") && !stored.startsWith("//")) {
      return stored
    }
  } catch {
    // sessionStorage can be unavailable; fall back to the editor
  }

  return "/tools/shader-lab"
}

export function AuthCompleteHandoff() {
  useEffect(() => {
    window.location.replace(resolveReturnTo())
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Signing you in…
      </Typography>
    </main>
  )
}
