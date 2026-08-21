"use client"

import { CheckIcon, Link2Icon } from "@radix-ui/react-icons"
import { useCallback, useEffect, useState } from "react"
import { IconButton } from "@/components/ui/icon-button"
import { sceneSharePath } from "@/lib/community/scene-links"

const LABELS = {
  copied: "Link copied",
  failed: "Could not copy the link",
  idle: "Copy link to this scene",
} as const

function copyViaSelection(text: string): boolean {
  try {
    const field = document.createElement("textarea")

    field.value = text
    field.setAttribute("readonly", "")
    field.style.cssText = "position:fixed;top:-1000px;opacity:0"
    document.body.appendChild(field)
    field.select()

    const copied = document.execCommand("copy")

    field.remove()

    return copied
  } catch {
    return false
  }
}

export function sceneShareUrl(slug: string): string {
  const origin =
    typeof window === "undefined"
      ? ""
      : window.location.origin.replace(/\/$/, "")

  return `${origin}${sceneSharePath(slug)}`
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

      return
    } catch {
      setState(copyViaSelection(url) ? "copied" : "failed")
    }
  }, [slug])

  const label = LABELS[state]

  return (
    <IconButton
      aria-label={label}
      className="h-8 w-8 shrink-0"
      onClick={() => void copy()}
      title={label}
      variant="outline"
    >
      {state === "copied" ? (
        <CheckIcon height={14} width={14} />
      ) : (
        <Link2Icon height={14} width={14} />
      )}
    </IconButton>
  )
}
