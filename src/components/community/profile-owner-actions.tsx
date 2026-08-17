"use client"

import { GearIcon } from "@radix-ui/react-icons"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type AccountProfile,
  UserSettingsDialog,
} from "@/components/community/user-settings-dialog"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth/client"
import { profilePagePath } from "@/lib/community/scene-links"
import type { Route } from "next"

export function useAccountProfile(handle: string) {
  const { data: session } = authClient.useSession()
  const [profile, setProfile] = useState<AccountProfile | null>(null)

  const refresh = useCallback(() => {
    if (!session?.user) {
      setProfile(null)

      return
    }

    fetch("/api/community/me/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AccountProfile | null) => setProfile(data))
      .catch(() => setProfile(null))
  }, [session?.user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    isOwner: profile?.handle === handle,
    profile,
    refresh,
  }
}

export function ProfileOwnerActions({ handle }: { handle: string }) {
  const router = useRouter()
  const { isOwner, profile } = useAccountProfile(handle)
  const [open, setOpen] = useState(false)

  if (!(isOwner && profile)) {
    return null
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="compact"
        variant="secondary"
      >
        <GearIcon height={13} width={13} />
        User settings
      </Button>

      <UserSettingsDialog
        onOpenChange={setOpen}
        onRenamed={(next) => {
          setOpen(false)
          router.replace(profilePagePath(next) as Route)
        }}
        open={open}
        profile={profile}
      />
    </>
  )
}
