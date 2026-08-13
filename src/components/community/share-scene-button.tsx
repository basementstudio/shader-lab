"use client"

import { CheckIcon, Link2Icon } from "@radix-ui/react-icons"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export function sceneShareUrl(slug: string): string {
  const origin =
    typeof window === "undefined"
      ? ""
      : window.location.origin.replace(/\/$/, "")

  return `${origin}/community/${slug}`
}

export function ShareSceneButton({ slug }: { slug: string }) {
  const [state, setState] = useState<"copied" | "failed" | "idle">("idle")

  useEffect(() => {
    if (state === "idle") {
      return
    }

    const timer = window.setTimeout(() => setState("idle"), 2200)

    return () => window.clearTimeout(timer)
  }, [state])

  const copy = useCallback(async () => {
    const url = sceneShareUrl(slug)

    try {
      await navigator.clipboard.writeText(url)
      setState("copied")
    } catch {
      setState("failed")
    }
  }, [slug])

  return (
    <Button
      fullWidth
      onClick={() => void copy()}
      size="compact"
      variant="secondary"
    >
      {state === "copied" ? (
        <CheckIcon height={13} width={13} />
      ) : (
        <Link2Icon height={13} width={13} />
      )}
      {state === "copied" ? "Link copied" : null}
      {state === "failed" ? "Press Cmd+C to copy" : null}
      {state === "idle" ? "Copy link" : null}
    </Button>
  )
}
