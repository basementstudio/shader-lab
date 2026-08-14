"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"

export function ShaderConsentDialog({
  onCancel,
  onConfirm,
  open,
  sceneTitle,
}: {
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  sceneTitle: string
}) {
  const reduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCancel()
      }
    }

    window.addEventListener("keydown", onKeyDown, true)

    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [onCancel, open])

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-100" role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Cancel remix"
            className="absolute inset-0 w-full border-0 bg-[rgb(4_5_7_/_0.64)]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onCancel}
            tabIndex={-1}
            transition={{
              duration: reduceMotion ? 0.12 : 0.18,
              ease: "easeOut",
            }}
            type="button"
          />

          <div className="absolute top-1/2 left-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: -6 }
              }
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 6 }
              }
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: "easeOut" }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <GlassPanel
                aria-describedby="shader-consent-body"
                aria-labelledby="shader-consent-title"
                aria-modal="true"
                className="overflow-hidden p-0"
                role="dialog"
                variant="panel"
              >
                <div className="border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                  <Typography
                    as="h2"
                    className="leading-5"
                    id="shader-consent-title"
                    variant="title"
                  >
                    This scene runs its own code
                  </Typography>
                </div>

                <div
                  className="flex flex-col gap-[var(--ds-space-2)] px-4 py-4"
                  id="shader-consent-body"
                >
                  <Typography as="p" tone="secondary" variant="body">
                    {`“${sceneTitle}” includes a custom shader written by its author. Remixing it compiles and runs that code in your browser, with access to your session.`}
                  </Typography>
                  <Typography as="p" tone="tertiary" variant="caption">
                    Only continue if you trust the author.
                  </Typography>
                </div>

                <div className="flex justify-end gap-[var(--ds-space-2)] border-t border-[var(--ds-border-divider)] px-4 py-3">
                  <Button autoFocus onClick={onCancel} variant="secondary">
                    Cancel
                  </Button>
                  <Button onClick={onConfirm} variant="primary">
                    Run and remix
                  </Button>
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
