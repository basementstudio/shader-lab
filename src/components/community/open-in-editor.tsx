"use client"

import { useEffect } from "react"
import { Typography } from "@/components/ui/typography"
import { editorSceneHref } from "@/lib/community/scene-links"

export function OpenInEditor({ slug }: { slug: string }) {
  useEffect(() => {
    window.location.replace(editorSceneHref(slug))
  }, [slug])

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-[#050507]">
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Opening in Shader Lab…
      </Typography>
    </div>
  )
}
