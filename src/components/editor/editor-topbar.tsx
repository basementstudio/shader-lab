"use client"

import {
  DownloadIcon,
  DragHandleDots2Icon,
  GearIcon,
  GitHubLogoIcon,
  ResetIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { HoverTooltip } from "@/components/ui/tooltip"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
  buildEditorHistorySnapshotFromState,
  getHistorySnapshotSignature,
} from "@/lib/editor/history"
import { applyZoomAtPoint, getNextZoomStep } from "@/lib/editor/view-transform"
import {
  registerHistoryShortcuts,
  useEditorStore,
  useHistoryStore,
  useLayerStore,
  useTimelineStore,
} from "@/store"
import { EditorExportDialog } from "./editor-export-dialog"

const HISTORY_COMMIT_DEBOUNCE_MS = 220
const GITHUB_REPO_URL = "https://github.com/basementstudio/shader-lab"

function GitHubStarLink({ mobile = false }: { mobile?: boolean }) {
  return (
    <HoverTooltip content="GitHub" side={mobile ? "top" : "bottom"}>
      <Link
        aria-label="Open Shader Lab on GitHub"
        className={
          mobile
            ? "inline-flex size-8 items-center justify-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8 hover:text-[var(--ds-color-text-primary)] active:scale-[0.98]"
            : "inline-flex h-7 w-7 items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8 hover:text-[var(--ds-color-text-primary)] active:scale-[0.98]"
        }
        href={GITHUB_REPO_URL}
        rel="noreferrer"
        target="_blank"
      >
        <GitHubLogoIcon height={14} width={14} />
      </Link>
    </HoverTooltip>
  )
}

export function EditorTopBar() {
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const mobilePanel = useEditorStore((state) => state.mobilePanel)
  const rightSidebarVisible = useEditorStore((state) => state.sidebars.right)
  const sidebarView = useEditorStore((state) => state.sidebarView)
  const setSidebarView = useEditorStore((state) => state.setSidebarView)
  const zoom = useEditorStore((state) => state.zoom)
  const panOffset = useEditorStore((state) => state.panOffset)
  const hasMovedFloatingPanels = useEditorStore(
    (state) =>
      state.floatingPanelsResetting ||
      Object.values(state.floatingPanels).some(
        (panel) => panel.x !== 0 || panel.y !== 0
      )
  )
  const resetFloatingPanels = useEditorStore(
    (state) => state.resetFloatingPanels
  )
  const setPan = useEditorStore((state) => state.setPan)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetView = useEditorStore((state) => state.resetView)
  const interactiveEditDepth = useEditorStore(
    (state) => state.interactiveEditDepth
  )
  const historyPastLength = useHistoryStore((state) => state.past.length)
  const historyFutureLength = useHistoryStore((state) => state.future.length)
  const pushSnapshot = useHistoryStore((state) => state.pushSnapshot)
  const redo = useHistoryStore((state) => state.redo)
  const undo = useHistoryStore((state) => state.undo)

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const applyingHistoryRef = useRef(false)
  const committedSnapshotRef = useRef(buildEditorHistorySnapshot())
  const pendingBaseSnapshotRef = useRef<ReturnType<
    typeof buildEditorHistorySnapshot
  > | null>(null)
  const latestSnapshotRef = useRef(buildEditorHistorySnapshot())
  const historyTimerRef = useRef<number | null>(null)

  const canUndo = historyPastLength > 0
  const canRedo = historyFutureLength > 0
  const mobileActionsOpen = mobilePanel === "actions"
  const hasResettableView =
    zoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0

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

      if (interactiveEditDepth > 0) {
        return
      }

      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current)
      }

      historyTimerRef.current = window.setTimeout(() => {
        flushPendingHistory()
        historyTimerRef.current = null
      }, HISTORY_COMMIT_DEBOUNCE_MS)
    },
    [flushPendingHistory, interactiveEditDepth]
  )

  useEffect(() => {
    if (interactiveEditDepth > 0 && historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
      return
    }

    if (interactiveEditDepth === 0) {
      flushPendingHistory()
    }
  }, [flushPendingHistory, interactiveEditDepth])

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
    const unsubscribeLayers = useLayerStore.subscribe(
      (state, previousState) => {
        if (applyingHistoryRef.current) {
          syncHistorySnapshotRefs()
          return
        }

        const previousSnapshot = buildEditorHistorySnapshotFromState(
          previousState,
          useTimelineStore.getState()
        )
        const nextSnapshot = buildEditorHistorySnapshotFromState(
          state,
          useTimelineStore.getState()
        )

        if (
          getHistorySnapshotSignature(previousSnapshot) ===
          getHistorySnapshotSignature(nextSnapshot)
        ) {
          return
        }

        scheduleHistoryCommit(nextSnapshot)
      }
    )

    const unsubscribeTimeline = useTimelineStore.subscribe(
      (state, previousState) => {
        if (applyingHistoryRef.current) {
          syncHistorySnapshotRefs()
          return
        }

        const previousSnapshot = buildEditorHistorySnapshotFromState(
          useLayerStore.getState(),
          previousState
        )
        const nextSnapshot = buildEditorHistorySnapshotFromState(
          useLayerStore.getState(),
          state
        )

        if (
          getHistorySnapshotSignature(previousSnapshot) ===
          getHistorySnapshotSignature(nextSnapshot)
        ) {
          return
        }

        scheduleHistoryCommit(nextSnapshot)
      }
    )

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
    const nextState = applyZoomAtPoint(
      zoom,
      panOffset,
      { x: 0, y: 0 },
      nextZoom
    )
    setZoom(nextState.zoom)
    setPan(nextState.panOffset.x, nextState.panOffset.y)
  }

  const toggleSidebarView = () => {
    setSidebarView(sidebarView === "scene" ? "properties" : "scene")
  }

  if (immersiveCanvas) {
    return null
  }

  return (
    <>
      <FloatingDesktopPanel
        id="topbar"
        resolvePosition={({ panelWidth, viewportWidth }) => ({
          left: Math.max(16, (viewportWidth - panelWidth) / 2),
          top: 16,
        })}
      >
        {({ dragHandleProps }) => (
          <GlassPanel
            className="flex min-h-11 w-auto items-center justify-between gap-[var(--ds-space-4)] px-[10px] py-2"
            variant="panel"
          >
            <div className="inline-flex items-center gap-1.5">
              <IconButton
                aria-label="Drag"
                className="h-7 w-7 cursor-grab text-[var(--ds-color-text-muted)] active:cursor-grabbing"
                tooltipSide="bottom"
                variant="ghost"
                {...dragHandleProps}
              >
                <DragHandleDots2Icon height={14} width={14} />
              </IconButton>
              <IconButton
                aria-label="Undo"
                className="h-7 w-7 disabled:opacity-45"
                disabled={!canUndo}
                onClick={handleUndo}
                tooltip="Revert"
                tooltipSide="bottom"
                variant="default"
              >
                <ResetIcon height={18} width={18} />
              </IconButton>
              <IconButton
                aria-label="Redo"
                className="h-7 w-7 disabled:opacity-45"
                disabled={!canRedo}
                onClick={handleRedo}
                tooltipSide="bottom"
                variant="default"
              >
                <ResetIcon className="scale-x-[-1]" height={18} width={18} />
              </IconButton>
            </div>

            <div className="inline-flex items-center gap-1.5">
              <IconButton
                aria-label="Zoom out"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => applyZoomStep("out")}
                tooltipSide="bottom"
                variant="default"
              >
                <ZoomOutIcon height={18} width={18} />
              </IconButton>
              <HoverTooltip
                content="Reset view"
                disabled={!hasResettableView}
                side="bottom"
              >
                <button
                  className="inline-flex h-7 min-w-16 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.98] max-[899px]:min-w-14"
                  onClick={resetView}
                  type="button"
                >
                  <Typography as="span" tone="secondary" variant="monoSm">
                    {Math.round(zoom * 100)}%
                  </Typography>
                </button>
              </HoverTooltip>
              <IconButton
                aria-label="Zoom in"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => applyZoomStep("in")}
                tooltipSide="bottom"
                variant="default"
              >
                <ZoomInIcon height={18} width={18} />
              </IconButton>
              <span
                aria-hidden="true"
                className="block h-5 w-px rounded-full bg-[var(--ds-border-divider)]"
              />
              <AnimatePresence initial={false}>
                {hasMovedFloatingPanels ? (
                  <motion.div
                    animate={{ opacity: 1, width: "auto" }}
                    className="overflow-hidden"
                    exit={{ opacity: 0, width: 0 }}
                    initial={{ opacity: 0, width: 0 }}
                    transition={{
                      duration: 0.2,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                  >
                    <HoverTooltip content="Reset layout" side="bottom">
                      <button
                        className="inline-flex h-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.98]"
                        onClick={resetFloatingPanels}
                        type="button"
                      >
                        <Typography
                          as="span"
                          tone="secondary"
                          variant="caption"
                        >
                          Reset layout
                        </Typography>
                      </button>
                    </HoverTooltip>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {rightSidebarVisible ? (
                <IconButton
                  aria-label={
                    sidebarView === "scene"
                      ? "Layer properties"
                      : "Scene settings"
                  }
                  className={cn(
                    "h-7 w-7",
                    sidebarView === "scene" && "bg-white/10"
                  )}
                  onClick={toggleSidebarView}
                  variant="default"
                >
                  <GearIcon height={16} width={16} />
                </IconButton>
              ) : null}
              <IconButton
                aria-label="Export"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => setIsExportDialogOpen(true)}
                tooltip="Download"
                tooltipSide="bottom"
                variant="default"
              >
                <DownloadIcon height={16} width={16} />
              </IconButton>
              <GitHubStarLink />
            </div>
          </GlassPanel>
        )}
      </FloatingDesktopPanel>

      {mobileActionsOpen ? (
        <div className="pointer-events-none fixed right-0 bottom-[88px] left-0 z-45 flex justify-center px-3 min-[900px]:hidden">
          <GlassPanel
            className="pointer-events-auto flex min-h-11 w-full max-w-[420px] flex-wrap items-center justify-between gap-2 p-2.5"
            variant="panel"
          >
            <div className="inline-flex w-full items-center justify-between gap-1.5">
              <IconButton
                aria-label="Undo"
                className="h-7 w-7 disabled:opacity-45"
                disabled={!canUndo}
                onClick={handleUndo}
                tooltip="Revert"
                variant="default"
              >
                <ResetIcon height={18} width={18} />
              </IconButton>
              <IconButton
                aria-label="Redo"
                className="h-7 w-7 disabled:opacity-45"
                disabled={!canRedo}
                onClick={handleRedo}
                variant="default"
              >
                <ResetIcon className="scale-x-[-1]" height={18} width={18} />
              </IconButton>
            </div>

            <div className="inline-flex w-full items-center justify-between gap-1.5">
              <IconButton
                aria-label="Zoom out"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => applyZoomStep("out")}
                variant="default"
              >
                <ZoomOutIcon height={18} width={18} />
              </IconButton>
              <HoverTooltip
                content="Reset view"
                disabled={!hasResettableView}
              >
                <button
                  className="inline-flex h-7 min-w-16 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.98]"
                  onClick={resetView}
                  type="button"
                >
                  <Typography as="span" tone="secondary" variant="monoSm">
                    {Math.round(zoom * 100)}%
                  </Typography>
                </button>
              </HoverTooltip>
              <IconButton
                aria-label="Zoom in"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => applyZoomStep("in")}
                variant="default"
              >
                <ZoomInIcon height={18} width={18} />
              </IconButton>
              <span
                aria-hidden="true"
                className="mx-1 block h-5 w-px rounded-full bg-[var(--ds-border-divider)]"
              />
              <IconButton
                aria-label="Export"
                className="h-7 w-7 disabled:opacity-45"
                onClick={() => setIsExportDialogOpen(true)}
                tooltip="Download"
                variant="default"
              >
                <DownloadIcon height={16} width={16} />
              </IconButton>
              <GitHubStarLink mobile />
            </div>
          </GlassPanel>
        </div>
      ) : null}

      <EditorExportDialog
        onOpenChange={setIsExportDialogOpen}
        open={isExportDialogOpen}
      />
    </>
  )
}
