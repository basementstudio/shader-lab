"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AuthorAvatar } from "@/components/community/author-avatar"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { numberInputControlClassName } from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  describeHandleInput,
  HANDLE_MAX_LENGTH,
} from "@/lib/community/handle"
import { profileDisplayPath } from "@/lib/community/scene-links"

export interface AccountProfile {
  avatarUrl: string | null
  canRenameAt: string | null
  displayName: string | null
  handle: string
  renamesUsed: number
}

function cooldownLabel(canRenameAt: string | null): string | null {
  if (!canRenameAt) {
    return null
  }

  const ready = new Date(canRenameAt)

  if (Number.isNaN(ready.getTime()) || ready.getTime() <= Date.now()) {
    return null
  }

  const days = Math.ceil((ready.getTime() - Date.now()) / 86_400_000)

  return `You changed your handle recently. You can change it again in ${days} ${days === 1 ? "day" : "days"}.`
}

export function UserSettingsDialog({
  onOpenChange,
  onRenamed,
  open,
  profile,
}: {
  onOpenChange: (open: boolean) => void
  onRenamed: (handle: string) => void
  open: boolean
  profile: AccountProfile
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState(profile.handle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setDraft(profile.handle)
      setError(null)
      setSaved(false)
      setSaving(false)
    }
  }, [open, profile.handle])

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange, open])

  const described = describeHandleInput(draft)
  const preview = "handle" in described ? described.handle : null
  const reason = "reason" in described ? described.reason : null
  const cooldown = cooldownLabel(profile.canRenameAt)
  const blocked = preview === profile.handle || Boolean(cooldown) || saving
  const canSubmit = Boolean(preview) && !blocked
  const hint = preview
    ? `shader-lab${profileDisplayPath(preview)}`
    : (reason ?? "")

  const submit = useCallback(async () => {
    if (!preview) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/community/me/handle", {
        body: JSON.stringify({ handle: preview }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      })
      const data = (await res.json()) as { error?: string; handle?: string }

      if (!(res.ok && data.handle)) {
        setError(data.error ?? "Could not change your handle.")

        return
      }

      setSaved(true)
      onRenamed(data.handle)
    } catch {
      setError("Could not change your handle.")
    } finally {
      setSaving(false)
    }
  }, [onRenamed, preview])

  if (!mounted) {
    return null
  }

  const label = profile.displayName ?? `@${profile.handle}`

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-110" role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close user settings"
            className="absolute inset-0 w-full border-0 bg-[rgb(4_5_7_/_0.56)]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            tabIndex={-1}
            transition={{
              duration: reduceMotion ? 0.12 : 0.18,
              ease: "easeOut",
            }}
            type="button"
          />

          <div className="absolute top-[96px] left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2">
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: -10 }
              }
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: 10 }
              }
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: "easeOut" }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <GlassPanel
                aria-modal="true"
                className="overflow-hidden p-0"
                role="dialog"
                variant="panel"
              >
                <div className="flex items-center justify-between border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                  <Typography as="h2" className="leading-5" variant="title">
                    User settings
                  </Typography>
                  <IconButton
                    aria-label="Close user settings"
                    className="h-7 w-7"
                    onClick={() => onOpenChange(false)}
                    variant="default"
                  >
                    <Cross2Icon height={18} width={18} />
                  </IconButton>
                </div>

                {error ? (
                  <div
                    className="border-b border-[var(--ds-border-divider)] bg-[rgb(120_28_28_/_0.22)] px-4 py-2"
                    role="alert"
                  >
                    <Typography as="p" variant="caption">
                      {error}
                    </Typography>
                  </div>
                ) : null}

                <div className="flex flex-col gap-[var(--ds-space-4)] p-4">
                  <div className="flex min-w-0 items-center gap-[var(--ds-space-3)]">
                    <AuthorAvatar
                      avatarUrl={profile.avatarUrl}
                      name={label}
                      size={40}
                    />
                    <div className="flex min-w-0 flex-col">
                      <Typography as="span" variant="label">
                        {label}
                      </Typography>
                      <Typography as="span" tone="tertiary" variant="monoXs">
                        Name and picture come from the account you signed in with
                      </Typography>
                    </div>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <Typography as="span" tone="tertiary" variant="overline">
                      Handle
                    </Typography>
                    <input
                      aria-label="Handle"
                      autoCapitalize="none"
                      autoComplete="off"
                      className={cn(numberInputControlClassName, "px-2")}
                      maxLength={HANDLE_MAX_LENGTH + 10}
                      onChange={(event) => setDraft(event.target.value)}
                      spellCheck={false}
                      value={draft}
                    />
                  </label>

                  <div className="flex flex-col gap-1">
                    <Typography as="span" tone="tertiary" variant="monoXs">
                      {hint}
                    </Typography>
                    {cooldown ? (
                      <Typography as="span" tone="tertiary" variant="caption">
                        {cooldown}
                      </Typography>
                    ) : null}
                    {saved ? (
                      <Typography as="span" tone="secondary" variant="caption">
                        Saved. Links to your old handle will redirect here.
                      </Typography>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-[var(--ds-space-2)]">
                    <Button
                      onClick={() => onOpenChange(false)}
                      size="compact"
                      variant="secondary"
                    >
                      Close
                    </Button>
                    <Button
                      disabled={!canSubmit}
                      onClick={submit}
                      size="compact"
                      variant="primary"
                    >
                      {saving ? "Saving…" : "Save handle"}
                    </Button>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
