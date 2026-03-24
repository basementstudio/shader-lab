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
import s from "./editor-topbar.module.css"

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
      <div className={s.root}>
        <GlassPanel className={s.bar} variant="panel">
          <div className={s.group}>
            <IconButton
              aria-label="Undo"
              className={s.controlButton}
              disabled={!canUndo}
              onClick={handleUndo}
              variant="default"
            >
              <ArrowCounterClockwiseIcon size={18} weight="bold" />
            </IconButton>
            <IconButton
              aria-label="Redo"
              className={s.controlButton}
              disabled={!canRedo}
              onClick={handleRedo}
              variant="default"
            >
              <ArrowClockwiseIcon size={18} weight="bold" />
            </IconButton>
          </div>

          <div className={s.group}>
            <IconButton
              aria-label="Zoom out"
              className={s.controlButton}
              onClick={() => applyZoomStep("out")}
              variant="default"
            >
              <MinusIcon size={18} weight="bold" />
            </IconButton>
            <button className={s.zoomReadout} onClick={resetView} type="button">
              <Typography as="span" tone="secondary" variant="monoSm">
                {Math.round(zoom * 100)}%
              </Typography>
            </button>
            <IconButton
              aria-label="Zoom in"
              className={s.controlButton}
              onClick={() => applyZoomStep("in")}
              variant="default"
            >
              <PlusIcon size={18} weight="bold" />
            </IconButton>
            <span aria-hidden="true" className={s.divider} />
            <IconButton
              aria-label="Export"
              className={s.controlButton}
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
