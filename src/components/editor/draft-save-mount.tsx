"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useBottomOffsetAboveTimeline } from "@/components/editor/use-bottom-offset-above-timeline"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { DEFAULT_DRAFT_TITLE } from "@/lib/community/upload-limits"
import {
  type DraftSaveRequest,
  registerDraftSaver,
  requestDraftSave,
} from "@/lib/editor/draft-save-bus"
import {
  disarmRemixDraft,
  readArmedRemixDraft,
  REMIX_DRAFT_SETTLE_MS,
} from "@/lib/editor/remix-draft"
import { useHistoryStore } from "@/store"

const SAVED_PILL_MS = 2500
const MESSAGE_PILL_MS = 6000

interface Notice {
  message: string
  tone: "error" | "notice" | "progress" | "success"
}

function describeSaveStart(request: DraftSaveRequest): string {
  if (request.auto) {
    return "Saving this remix as a draft…"
  }

  return request.asNewDraft ? "Saving a new draft…" : "Saving draft…"
}

function describeSaved(request: DraftSaveRequest, created: boolean): string {
  if (request.auto) {
    return "Remix saved as a draft"
  }

  return created ? "New draft saved" : "Draft saved"
}

export function DraftSaveMount() {
  const reduceMotion = useReducedMotion() ?? false
  const { data: session } = authClient.useSession()
  const [notice, setNotice] = useState<Notice | null>(null)
  const pillBottom = useBottomOffsetAboveTimeline(notice !== null)
  const savingRef = useRef(false)
  const signedIn = Boolean(session?.user)

  const save = useCallback(
    async (request: DraftSaveRequest) => {
      if (!signedIn) {
        if (request.auto) {
          return
        }

        setNotice({
          message: "Sign in to save this draft to your account.",
          tone: "notice",
        })

        return
      }

      if (savingRef.current) {
        return
      }

      savingRef.current = true
      setNotice({
        message: describeSaveStart(request),
        tone: "progress",
      })

      try {
        const { saveDraft } = await import("@/lib/community/publish-client")
        const result = await saveDraft({
          asNewDraft: Boolean(request.asNewDraft),
          ...(request.title === undefined ? {} : { title: request.title }),
          ...(request.withThumbnail === undefined
            ? {}
            : { withThumbnail: request.withThumbnail }),
        })
        const saved = describeSaved(request, result.created)

        setNotice(
          result.skipped.length > 0
            ? {
                message: `${saved}. ${result.skipped.join(", ")} ${result.skipped.length === 1 ? "was" : "were"} too large to upload.`,
                tone: "error",
              }
            : {
                message:
                  result.title === DEFAULT_DRAFT_TITLE
                    ? saved
                    : `${saved} · ${result.title}`,
                tone: "success",
              }
        )
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Could not save this draft."

        setNotice(
          request.auto
            ? {
                message: `${message} This scene stays in this browser.`,
                tone: "notice",
              }
            : { message, tone: "error" }
        )
      } finally {
        savingRef.current = false
      }
    },
    [signedIn]
  )

  useEffect(() => {
    registerDraftSaver((request) => void save(request))

    return () => registerDraftSaver(null)
  }, [save])

  useEffect(() => {
    let seen = useHistoryStore.getState().past.length

    return useHistoryStore.subscribe((state) => {
      const grew = state.past.length > seen

      seen = state.past.length

      if (!grew) {
        return
      }

      const pending = readArmedRemixDraft()

      if (!(pending && signedIn)) {
        return
      }

      if (Date.now() - pending.armedAt < REMIX_DRAFT_SETTLE_MS) {
        return
      }

      disarmRemixDraft()
      requestDraftSave({
        asNewDraft: true,
        auto: true,
        title: pending.title,
        withThumbnail: true,
      })
    })
  }, [signedIn])

  useEffect(() => {
    if (!notice || notice.tone === "progress") {
      return
    }

    const timer = window.setTimeout(
      () => setNotice(null),
      notice.tone === "success" ? SAVED_PILL_MS : MESSAGE_PILL_MS
    )

    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <AnimatePresence initial={false}>
      {notice ? (
        <motion.div
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          className="pointer-events-none fixed left-1/2 z-95 -translate-x-1/2"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          style={{ bottom: pillBottom }}
          transition={
            reduceMotion
              ? { duration: 0.12, ease: "easeOut" }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <GlassPanel
            className="pointer-events-auto flex items-center gap-[var(--ds-space-2)] py-1.5 pr-1.5 pl-3"
            variant="panel"
          >
            <Typography
              as="span"
              tone={notice.tone === "error" ? "primary" : "secondary"}
              variant="caption"
            >
              {notice.message}
            </Typography>
            <IconButton
              aria-label="Dismiss draft notice"
              className="h-7 w-7"
              onClick={() => setNotice(null)}
              variant="default"
            >
              <Cross2Icon height={16} width={16} />
            </IconButton>
          </GlassPanel>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
