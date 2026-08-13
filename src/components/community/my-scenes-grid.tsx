"use client"

import { TrashIcon } from "@radix-ui/react-icons"
import { useState } from "react"
import { SceneCard } from "@/components/community/scene-card"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import type {
  AuthoredScene,
  CommunitySceneSummary,
} from "@/lib/community/scenes"

export function MyScenesGrid({
  onDeleted,
  onSelect,
  scenes,
}: {
  onDeleted: (slug: string) => void
  onSelect: (scene: CommunitySceneSummary) => void
  scenes: AuthoredScene[]
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const remove = async (scene: AuthoredScene) => {
    const confirmed = window.confirm(
      `Delete "${scene.title}"? This removes the scene and its uploaded files for good.`
    )

    if (!confirmed) {
      return
    }

    setDeleting(scene.slug)
    setFailed(null)

    try {
      const res = await fetch(`/api/community/scenes/${scene.slug}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        setFailed(scene.slug)
        return
      }

      onDeleted(scene.slug)
    } catch {
      setFailed(scene.slug)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
      {scenes.map((scene) => (
        <div className="relative" key={scene.slug}>
          <SceneCard onSelect={onSelect} scene={scene} />

          {scene.status === "published" ? null : (
            <div className="pointer-events-none absolute top-1.5 left-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
              <Typography as="span" tone="secondary" variant="monoXs">
                {scene.status}
              </Typography>
            </div>
          )}

          <IconButton
            aria-label={`Delete ${scene.title}`}
            className="absolute right-1.5 bottom-[52px] h-7 w-7"
            disabled={deleting === scene.slug}
            onClick={() => void remove(scene)}
            variant="default"
          >
            <TrashIcon height={14} width={14} />
          </IconButton>

          {failed === scene.slug ? (
            <Typography as="p" tone="tertiary" variant="caption">
              Could not delete that scene.
            </Typography>
          ) : null}
        </div>
      ))}
    </div>
  )
}
