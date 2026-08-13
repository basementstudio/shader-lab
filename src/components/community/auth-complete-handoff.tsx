"use client"

import { useEffect } from "react"
import { Typography } from "@/components/ui/typography"
import { AUTH_POPUP_MESSAGE } from "@/lib/auth/sign-in-popup"

export function AuthCompleteHandoff() {
  useEffect(() => {
    const opener = window.opener as Window | null

    if (opener && opener !== window) {
      opener.postMessage({ type: AUTH_POPUP_MESSAGE }, window.location.origin)
      window.close()

      return
    }

    window.location.replace("/tools/shader-lab")
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Signing you in…
      </Typography>
    </main>
  )
}
