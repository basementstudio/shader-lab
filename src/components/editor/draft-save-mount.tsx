"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useBottomOffsetAboveTimeline } from "@/components/editor/use-bottom-offset-above-timeline"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import {
  type DraftSaveRequest,
  registerDraftSaver,
} from "@/lib/editor/draft-save-bus"

const SAVED_PILL_MS = 2500
const MESSAGE_PILL_MS = 6000

interface Notice {
  message: string
  tone: "error" | "notice" | "progress" | "success"
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
        message: request.asNewDraft ? "Saving a new draft…" : "Saving draft…",
        tone: "progress",
      })

      try {
        const { saveDraft } = await import("@/lib/community/publish-client")
        const result = await saveDraft({
          asNewDraft: Boolean(request.asNewDraft),
        })
        const saved = result.created ? "New draft saved" : "Draft saved"

        setNotice(
          result.skipped.length > 0
            ? {
                message: `${saved}. ${result.skipped.join(", ")} ${result.skipped.length === 1 ? "was" : "were"} too large to upload.`,
                tone: "error",
              }
            : { message: `${saved} · ${result.title}`, tone: "success" }
        )
      } catch (cause) {
        setNotice({
          message:
            cause instanceof Error
              ? cause.message
              : "Could not save this draft.",
          tone: "error",
        })
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
