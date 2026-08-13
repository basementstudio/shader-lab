"use client"

import { TrashIcon } from "@radix-ui/react-icons"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"

export function DeleteSceneControl({
  onDeleted,
  slug,
}: {
  onDeleted: (slug: string) => void
  slug: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  const remove = async () => {
    setDeleting(true)
    setFailed(false)

    try {
      const res = await fetch(`/api/community/scenes/${slug}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        setFailed(true)
        setDeleting(false)
        return
      }

      onDeleted(slug)
    } catch {
      setFailed(true)
      setDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        fullWidth
        onClick={() => setConfirming(true)}
        size="compact"
        variant="ghost"
      >
        <TrashIcon height={13} width={13} />
        Delete this scene
      </Button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-[var(--ds-space-2)]">
      <Typography as="p" tone="secondary" variant="caption">
        {failed ? "Could not delete." : "Are you sure?"}
      </Typography>

      <div className="flex gap-1.5">
        <Button
          disabled={deleting}
          onClick={() => void remove()}
          size="compact"
          variant="primary"
        >
          {deleting ? "Deleting…" : "Confirm"}
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
  )
}
