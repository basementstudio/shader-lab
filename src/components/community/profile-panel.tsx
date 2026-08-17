"use client"

import { GearIcon } from "@radix-ui/react-icons"
import { useEffect, useState } from "react"
import { ProfileHeader } from "@/components/community/profile-header"
import { useAccountProfile } from "@/components/community/profile-owner-actions"
import { SceneCard } from "@/components/community/scene-card"
import { SceneLoadMore } from "@/components/community/scene-load-more"
import { UserSettingsDialog } from "@/components/community/user-settings-dialog"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import type { PublicProfileView } from "@/lib/community/profiles"
import type { CommunitySceneSummary } from "@/lib/community/scenes"
import { useScenePages } from "@/lib/community/use-scene-pages"

const SKELETON_KEYS = ["a", "b", "c", "d"] as const

export function ProfilePanel({
  handle,
  onRenamed,
  onSelect,
}: {
  handle: string
  onRenamed: (handle: string) => void
  onSelect: (scene: CommunitySceneSummary) => void
}) {
  const [profile, setProfile] = useState<PublicProfileView | null>(null)
  const [failed, setFailed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const account = useAccountProfile(handle)
  const { error, hasMore, loadMore, loading, scenes } = useScenePages({
    author: handle,
    sort: "latest",
  })

  useEffect(() => {
    let cancelled = false

    setProfile(null)
    setFailed(false)

    fetch(`/api/community/profiles/${encodeURIComponent(handle)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { profile: PublicProfileView }) => {
        if (!cancelled) {
          setProfile(data.profile)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [handle])

  const label = profile?.displayName ?? `@${handle}`

  return (
    <div className="h-full overflow-y-auto p-4">
      {profile ? (
        <div className="mb-[var(--ds-space-5)]">
          <ProfileHeader
            action={
              account.isOwner && account.profile ? (
                <Button
                  onClick={() => setSettingsOpen(true)}
                  size="compact"
                  variant="secondary"
                >
                  <GearIcon height={13} width={13} />
                  User settings
                </Button>
              ) : null
            }
            avatarSize={44}
            profile={profile}
          />

          {account.profile ? (
            <UserSettingsDialog
              onOpenChange={setSettingsOpen}
              onRenamed={(next) => {
                setSettingsOpen(false)
                account.refresh()
                onRenamed(next)
              }}
              open={settingsOpen}
              profile={account.profile}
            />
          ) : null}
        </div>
      ) : null}

      {profile || failed ? null : (
        <div className="mb-[var(--ds-space-5)] flex animate-pulse items-center gap-[var(--ds-space-3)]">
          <div className="size-[44px] shrink-0 rounded-full bg-[var(--ds-color-surface-subtle)]" />
          <div className="flex flex-col gap-[var(--ds-space-2)]">
            <div className="h-5 w-[180px] rounded-[4px] bg-[var(--ds-color-surface-subtle)]" />
            <div className="h-[10px] w-[130px] rounded-[3px] bg-[var(--ds-color-surface-subtle)]" />
          </div>
        </div>
      )}

      {failed ? (
        <Typography as="p" tone="tertiary" variant="caption">
          Could not load that profile.
        </Typography>
      ) : null}

      {scenes === null && !error ? (
        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
          {SKELETON_KEYS.map((key) => (
            <div
              className="flex animate-pulse flex-col gap-[var(--ds-space-2)]"
              key={key}
            >
              <div className="aspect-[16/10] w-full rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
              <div className="h-[10px] w-3/5 rounded-[3px] bg-[var(--ds-color-surface-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {scenes?.length === 0 ? (
        <Typography as="p" tone="tertiary" variant="caption">
          {label} has not published a scene yet.
        </Typography>
      ) : null}

      {scenes && scenes.length > 0 ? (
        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
          {scenes.map((scene) => (
            <SceneCard key={scene.id} onSelect={onSelect} scene={scene} />
          ))}
        </div>
      ) : null}

      {scenes && scenes.length > 0 ? (
        <SceneLoadMore
          error={error}
          hasMore={hasMore}
          loadMore={loadMore}
          loading={loading}
          total={scenes.length}
        />
      ) : null}
    </div>
  )
}
