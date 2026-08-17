"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_PILL_MS,
} from "@/lib/editor/autosave/limits"
import { registerAutosaveRequester } from "@/lib/editor/autosave/bus"
import { buildAutosaveSignature } from "@/lib/editor/autosave/record"
import { createAutosaveScheduler } from "@/lib/editor/autosave/scheduler"
import {
  findRestorableAutosave,
  forgetAutosaveRecord,
  forgetOwnAutosaveRecord,
  saveAutosaveRecord,
} from "@/lib/editor/autosave/store"
import {
  isAutosaveSuppressed,
  withAutosaveSuppressed,
} from "@/lib/editor/autosave/suppress"
import {
  audioChanged,
  editorChanged,
  layersChanged,
  releasedInteractiveEdit,
  timelineChanged,
} from "@/lib/editor/autosave/triggers"
import { getDefaultProjectFile } from "@/lib/editor/default-project"
import {
  applyLabProjectFile,
  buildLabProjectFile,
} from "@/lib/editor/project-file"
import { getRequestedSceneSlug } from "@/lib/editor/requested-scene-slug"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"
import { useTimelineStore } from "@/store/timeline-store"

export function AutosaveMount() {
  const reduceMotion = useReducedMotion() ?? false
  const [restored, setRestored] = useState(false)
  const readyRef = useRef(false)
  const signatureRef = useRef<string | null>(null)
  const restoredFromRef = useRef<string | null>(null)
  const editedBeforeReadyRef = useRef(false)

  const persist = useCallback(() => {
    if (!readyRef.current) {
      return
    }

    const projectFile = buildLabProjectFile()
    const remixOrigin = useRemixOriginStore.getState().origin
    const signature = buildAutosaveSignature({ projectFile, remixOrigin })

    if (signature === signatureRef.current) {
      return
    }

    signatureRef.current = signature
    void saveAutosaveRecord({ projectFile, remixOrigin })
  }, [])

  const schedulerRef = useRef<ReturnType<
    typeof createAutosaveScheduler
  > | null>(null)

  if (!schedulerRef.current) {
    schedulerRef.current = createAutosaveScheduler({
      cancel: (handle) => window.clearTimeout(handle),
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      isSuppressed: () =>
        isAutosaveSuppressed() ||
        useEditorStore.getState().interactiveEditDepth > 0,
      maxWaitMs: AUTOSAVE_MAX_WAIT_MS,
      now: () => Date.now(),
      onFlush: persist,
      schedule: (run, ms) => window.setTimeout(run, ms),
    })
  }

  const scheduler = schedulerRef.current

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (getRequestedSceneSlug()) {
        readyRef.current = true

        return
      }

      const candidate = await findRestorableAutosave()

      if (cancelled) {
        return
      }

      if (!candidate) {
        readyRef.current = true

        return
      }

      // The editor is usable before this lookup finishes. Anything typed in that
      // window is real work and outranks the record on disk.
      if (editedBeforeReadyRef.current) {
        readyRef.current = true
        scheduler.request()

        return
      }

      try {
        withAutosaveSuppressed(() => {
          applyLabProjectFile(
            candidate.projectFile,
            useAssetStore.getState().assets
          )

          if (candidate.remixOrigin) {
            useRemixOriginStore.getState().setRemixOrigin(candidate.remixOrigin)
          }
        })

        signatureRef.current = buildAutosaveSignature({
          projectFile: candidate.projectFile,
          remixOrigin: candidate.remixOrigin,
        })

        restoredFromRef.current = candidate.sessionId
        setRestored(true)
      } catch {
        signatureRef.current = null
      }

      readyRef.current = true
    }

    void boot()

    return () => {
      cancelled = true
    }
  }, [scheduler])

  useEffect(() => {
    if (!restored) {
      return
    }

    const timer = window.setTimeout(() => setRestored(false), AUTOSAVE_PILL_MS)

    return () => window.clearTimeout(timer)
  }, [restored])

  useEffect(() => {
    registerAutosaveRequester(() => scheduler.request())

    return () => registerAutosaveRequester(null)
  }, [scheduler])

  useEffect(() => {
    const request = () => {
      if (!(readyRef.current || isAutosaveSuppressed())) {
        editedBeforeReadyRef.current = true
      }

      scheduler.request()
    }

    const unsubscribers = [
      useLayerStore.subscribe((state, previous) => {
        if (layersChanged(previous, state)) {
          request()
        }
      }),
      useTimelineStore.subscribe((state, previous) => {
        if (timelineChanged(previous, state)) {
          request()
        }
      }),
      useAudioStore.subscribe((state, previous) => {
        if (audioChanged(previous, state)) {
          request()
        }
      }),
      useAssetStore.subscribe((state, previous) => {
        if (state.assets !== previous.assets) {
          request()
        }
      }),
      useEditorStore.subscribe((state, previous) => {
        if (editorChanged(previous, state)) {
          request()
        }

        if (releasedInteractiveEdit(state, previous)) {
          scheduler.flush()
        }
      }),
      useRemixOriginStore.subscribe((state, previous) => {
        if (state.origin !== previous.origin) {
          request()
        }
      }),
    ]

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
    }
  }, [scheduler])

  useEffect(() => {
    const flush = () => scheduler.flush()

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush()
      }
    }

    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", flush)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", flush)
      scheduler.cancel()
    }
  }, [scheduler])

  const startFresh = useCallback(() => {
    setRestored(false)
    scheduler.cancel()

    withAutosaveSuppressed(() => {
      applyLabProjectFile(
        getDefaultProjectFile(),
        useAssetStore.getState().assets
      )
      useRemixOriginStore.getState().clearRemixOrigin()
    })

    signatureRef.current = null

    const restoredFrom = restoredFromRef.current

    restoredFromRef.current = null

    void forgetOwnAutosaveRecord()

    // The discarded scene lives under the session that wrote it, not this one.
    if (restoredFrom) {
      void forgetAutosaveRecord(restoredFrom)
    }
  }, [scheduler])

  return (
    <AnimatePresence initial={false}>
      {restored ? (
        <motion.div
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          className="pointer-events-none fixed bottom-4 left-1/2 z-95 -translate-x-1/2"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={
            reduceMotion
              ? { duration: 0.12, ease: "easeOut" }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <GlassPanel
            className="pointer-events-auto flex items-center gap-[var(--ds-space-3)] px-3 py-2"
            variant="panel"
          >
            <Typography as="span" tone="secondary" variant="caption">
              Restored your last session
            </Typography>
            <Button onClick={startFresh} size="compact" variant="secondary">
              Start fresh
            </Button>
          </GlassPanel>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
