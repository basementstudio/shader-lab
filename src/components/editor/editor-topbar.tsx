"use client"

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
  buildEditorHistorySnapshotFromState,
  getHistorySnapshotSignature,
} from "@/lib/editor/history"
import {
  applyZoomAtPoint,
  getNextZoomStep,
} from "@/lib/editor/view-transform"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import {
  registerHistoryShortcuts,
  useEditorStore,
  useHistoryStore,
  useLayerStore,
  useTimelineStore,
} from "@/store"
import { EditorExportDialog } from "./editor-export-dialog"

const HISTORY_COMMIT_DEBOUNCE_MS = 220

export function EditorTopBar() {
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const zoom = useEditorStore((state) => state.zoom)
  const panOffset = useEditorStore((state) => state.panOffset)
  const setPan = useEditorStore((state) => state.setPan)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetView = useEditorStore((state) => state.resetView)
  const historyPastLength = useHistoryStore((state) => state.past.length)
  const historyFutureLength = useHistoryStore((state) => state.future.length)
  const pushSnapshot = useHistoryStore((state) => state.pushSnapshot)
  const redo = useHistoryStore((state) => state.redo)
  const undo = useHistoryStore((state) => state.undo)

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const applyingHistoryRef = useRef(false)
  const committedSnapshotRef = useRef(buildEditorHistorySnapshot())
  const pendingBaseSnapshotRef = useRef<ReturnType<typeof buildEditorHistorySnapshot> | null>(
    null,
  )
  const latestSnapshotRef = useRef(buildEditorHistorySnapshot())
  const historyTimerRef = useRef<number | null>(null)

  const canUndo = historyPastLength > 0
  const canRedo = historyFutureLength > 0

  const syncHistorySnapshotRefs = useCallback(() => {
    const snapshot = buildEditorHistorySnapshot()
    committedSnapshotRef.current = snapshot
    latestSnapshotRef.current = snapshot
  }, [])

  const flushPendingHistory = useCallback(() => {
    if (!(pendingBaseSnapshotRef.current && latestSnapshotRef.current)) {
      return
    }

    if (
      getHistorySnapshotSignature(pendingBaseSnapshotRef.current) ===
      getHistorySnapshotSignature(latestSnapshotRef.current)
    ) {
      pendingBaseSnapshotRef.current = null
      committedSnapshotRef.current = latestSnapshotRef.current
      return
    }

    pushSnapshot("Editor change", pendingBaseSnapshotRef.current)
    committedSnapshotRef.current = latestSnapshotRef.current
    pendingBaseSnapshotRef.current = null
  }, [pushSnapshot])

  const scheduleHistoryCommit = useCallback(
    (nextSnapshot: ReturnType<typeof buildEditorHistorySnapshot>) => {
      latestSnapshotRef.current = nextSnapshot

      if (!pendingBaseSnapshotRef.current) {
        pendingBaseSnapshotRef.current = committedSnapshotRef.current
      }

      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current)
      }

      historyTimerRef.current = window.setTimeout(() => {
        flushPendingHistory()
        historyTimerRef.current = null
      }, HISTORY_COMMIT_DEBOUNCE_MS)
    },
    [flushPendingHistory],
  )

  const handleUndo = useCallback(() => {
    flushPendingHistory()
    const currentSnapshot = buildEditorHistorySnapshot()
    const previousSnapshot = undo(currentSnapshot)

    if (!previousSnapshot) {
      return
    }

    applyingHistoryRef.current = true
    applyEditorHistorySnapshot(previousSnapshot)
    syncHistorySnapshotRefs()
    pendingBaseSnapshotRef.current = null
    applyingHistoryRef.current = false
  }, [flushPendingHistory, syncHistorySnapshotRefs, undo])

  const handleRedo = useCallback(() => {
    flushPendingHistory()
    const currentSnapshot = buildEditorHistorySnapshot()
    const nextSnapshot = redo(currentSnapshot)

    if (!nextSnapshot) {
      return
    }

    applyingHistoryRef.current = true
    applyEditorHistorySnapshot(nextSnapshot)
    syncHistorySnapshotRefs()
    pendingBaseSnapshotRef.current = null
    applyingHistoryRef.current = false
  }, [flushPendingHistory, redo, syncHistorySnapshotRefs])

  useEffect(() => {
    const unregisterShortcuts = registerHistoryShortcuts(handleUndo, handleRedo)
    const unsubscribeLayers = useLayerStore.subscribe((state, previousState) => {
      if (applyingHistoryRef.current) {
        syncHistorySnapshotRefs()
        return
      }

      const previousSnapshot = buildEditorHistorySnapshotFromState(
        previousState,
        useTimelineStore.getState(),
      )
      const nextSnapshot = buildEditorHistorySnapshotFromState(
        state,
        useTimelineStore.getState(),
      )

      if (
        getHistorySnapshotSignature(previousSnapshot) ===
        getHistorySnapshotSignature(nextSnapshot)
      ) {
        return
      }

      scheduleHistoryCommit(nextSnapshot)
    })

    const unsubscribeTimeline = useTimelineStore.subscribe((state, previousState) => {
      if (applyingHistoryRef.current) {
        syncHistorySnapshotRefs()
        return
      }

      const previousSnapshot = buildEditorHistorySnapshotFromState(
        useLayerStore.getState(),
        previousState,
      )
      const nextSnapshot = buildEditorHistorySnapshotFromState(
        useLayerStore.getState(),
        state,
      )

      if (
        getHistorySnapshotSignature(previousSnapshot) ===
        getHistorySnapshotSignature(nextSnapshot)
      ) {
        return
      }

      scheduleHistoryCommit(nextSnapshot)
    })

    return () => {
      unregisterShortcuts()
      unsubscribeLayers()
      unsubscribeTimeline()

      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current)
      }
    }
  }, [handleRedo, handleUndo, scheduleHistoryCommit, syncHistorySnapshotRefs])

  function applyZoomStep(direction: "in" | "out") {
    const nextZoom = getNextZoomStep(zoom, direction)
    const nextState = applyZoomAtPoint(zoom, panOffset, { x: 0, y: 0 }, nextZoom)
    setZoom(nextState.zoom)
    setPan(nextState.panOffset.x, nextState.panOffset.y)
  }

  if (immersiveCanvas) {
    return null
  }

  return (
    <>
      <div className="pointer-events-none fixed top-4 right-0 left-0 z-45 flex justify-center">
        <GlassPanel
          className="pointer-events-auto flex min-h-11 w-auto items-center justify-between gap-[var(--ds-space-4)] px-[10px] py-2 max-[899px]:gap-[10px] max-[899px]:p-2"
          variant="panel"
        >
          <div className="inline-flex items-center gap-1.5 max-[899px]:gap-1">
            <IconButton
              aria-label="Undo"
              className="h-7 w-7 disabled:opacity-45"
              disabled={!canUndo}
              onClick={handleUndo}
              variant="default"
            >
              <ArrowCounterClockwiseIcon size={18} weight="bold" />
            </IconButton>
            <IconButton
              aria-label="Redo"
              className="h-7 w-7 disabled:opacity-45"
              disabled={!canRedo}
              onClick={handleRedo}
              variant="default"
            >
              <ArrowClockwiseIcon size={18} weight="bold" />
            </IconButton>
          </div>

          <div className="inline-flex items-center gap-1.5 max-[899px]:gap-1">
            <IconButton
              aria-label="Zoom out"
              className="h-7 w-7 disabled:opacity-45"
              onClick={() => applyZoomStep("out")}
              variant="default"
            >
              <MinusIcon size={18} weight="bold" />
            </IconButton>
            <button
              className="inline-flex h-7 min-w-16 items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.98] max-[899px]:min-w-14"
              onClick={resetView}
              type="button"
            >
              <Typography as="span" tone="secondary" variant="monoSm">
                {Math.round(zoom * 100)}%
              </Typography>
            </button>
            <IconButton
              aria-label="Zoom in"
              className="h-7 w-7 disabled:opacity-45"
              onClick={() => applyZoomStep("in")}
              variant="default"
            >
              <PlusIcon size={18} weight="bold" />
            </IconButton>
            <span
              aria-hidden="true"
              className="block h-5 w-px rounded-full bg-[var(--ds-border-divider)]"
            />
            <IconButton
              aria-label="Export"
              className="h-7 w-7 disabled:opacity-45"
              onClick={() => setIsExportDialogOpen(true)}
              variant="default"
            >
              <DownloadSimpleIcon size={16} weight="bold" />
            </IconButton>
          </div>
        </GlassPanel>
      </div>

      <EditorExportDialog
        onOpenChange={setIsExportDialogOpen}
        open={isExportDialogOpen}
      />
    </>
  )
}
