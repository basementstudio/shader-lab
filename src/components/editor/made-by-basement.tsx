"use client"

import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { useEditorStore } from "@/store"

export function MadeByBasement() {
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)

  if (immersiveCanvas) {
    return null
  }

  return (
    <Link
      className="fixed right-4 bottom-4 z-10 hidden cursor-pointer text-[var(--ds-color-text-muted)] transition-colors duration-160 hover:text-[var(--ds-color-text-primary)] min-[900px]:block"
      href="https://basement.studio"
      rel="noreferrer"
      target="_blank"
    >
      <Typography as="span" tone="inherit" variant="monoXs">
        made by basement
      </Typography>
    </Link>
  )
}
