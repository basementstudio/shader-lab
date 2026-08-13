"use client"

import { TrashIcon } from "@radix-ui/react-icons"
import { useState } from "react"
import { SceneCard } from "@/components/community/scene-card"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import type {
  AuthoredScene,
  CommunitySceneSummary,
} from "@/lib/community/scenes"

const THUMBNAIL_OVERLAY = "absolute inset-x-0 top-0 aspect-[16/10]"

function SceneTile({
  onDeleted,
  onSelect,
  scene,
}: {
  onDeleted: (slug: string) => void
  onSelect: (scene: CommunitySceneSummary) => void
  scene: AuthoredScene
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setDeleting(true)
    setFailed(false)

    try {
      const res = await fetch(`/api/community/scenes/${scene.slug}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        setFailed(true)
        setDeleting(false)
        return
      }

      onDeleted(scene.slug)
    } catch {
      setFailed(true)
      setDeleting(false)
    }
  }

  return (
    <div className="relative">
      <SceneCard onSelect={onSelect} scene={scene} />

      <div className={`${THUMBNAIL_OVERLAY} pointer-events-none`}>
        {scene.status === "published" ? null : (
          <div className="absolute top-1.5 left-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
            <Typography as="span" tone="secondary" variant="monoXs">
              {scene.status}
            </Typography>
          </div>
        )}

        {confirming ? null : (
          <div className="pointer-events-auto absolute bottom-1.5 left-1.5">
            <IconButton
              aria-label={`Delete ${scene.title}`}
              className="h-7 w-7 border-white/10 bg-[rgb(8_9_12_/_0.68)] backdrop-blur-[8px]"
              onClick={() => setConfirming(true)}
              variant="default"
            >
              <TrashIcon height={14} width={14} />
            </IconButton>
          </div>
        )}
      </div>

      {confirming ? (
        <div
          className={`${THUMBNAIL_OVERLAY} flex flex-col items-center justify-center gap-[var(--ds-space-2)] rounded-[8px] border border-[var(--ds-border-active)] bg-[rgb(8_9_12_/_0.86)] px-3 backdrop-blur-[10px]`}
        >
          <Typography align="center" as="p" tone="secondary" variant="caption">
            {failed
              ? "Could not delete that scene."
              : "Delete this scene and its files?"}
          </Typography>

          <div className="flex gap-1.5">
            <Button
              disabled={deleting}
              onClick={() => void remove()}
              size="compact"
              variant="primary"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button
              disabled={deleting}
              onClick={() => {
                setConfirming(false)
                setFailed(false)
              }}
              size="compact"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MyScenesGrid({
  onDeleted,
  onSelect,
  scenes,
}: {
  onDeleted: (slug: string) => void
  onSelect: (scene: CommunitySceneSummary) => void
  scenes: AuthoredScene[]
}) {
  return (
    <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
      {scenes.map((scene) => (
        <SceneTile
          key={scene.slug}
          onDeleted={onDeleted}
          onSelect={onSelect}
          scene={scene}
        />
      ))}
    </div>
  )
}
