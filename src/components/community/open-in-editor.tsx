"use client"

import { useEffect, useState } from "react"
import { Typography } from "@/components/ui/typography"
import {
  editorSceneHref,
  OPEN_IN_EDITOR_PARAM,
} from "@/lib/community/scene-links"

export function OpenInEditor({ slug }: { slug: string }) {
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    if (params.get(OPEN_IN_EDITOR_PARAM) !== "1") {
      return
    }

    setOpening(true)
    window.location.replace(editorSceneHref(slug))
  }, [slug])

  if (!opening) {
    return null
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[#050507]">
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Opening in Shader Lab…
      </Typography>
    </div>
  )
}
