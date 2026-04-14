"use client"

import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useEditorStore } from "@/store/editor-store"

type FloatingPanelId = "layers" | "properties" | "timeline" | "topbar"

type FloatingDesktopPanelProps = {
  children: (props: {
    dragHandleProps: {
      "data-floating-drag-handle": "true"
      onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void
    }
  }) => ReactNode
  id: FloatingPanelId
  resolvePosition: (args: {
    panelHeight: number
    panelWidth: number
    viewportHeight: number
    viewportWidth: number
  }) => {
    left: number
    top: number
  }
}

const VIEWPORT_MARGIN = 12

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  if (target.closest("[data-floating-drag-handle='true']")) {
    return false
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true
  }

  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "select",
        "textarea",
        "a",
        "[role='button']",
        "[data-floating-no-drag='true']",
      ].join(",")
    )
  )
}

function getViewportSize() {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  }
}

export function FloatingDesktopPanel({
  children,
  id,
  resolvePosition,
}: FloatingDesktopPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startOffsetX: number
    startOffsetY: number
    startPointerX: number
    startPointerY: number
  } | null>(null)
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 })
  const [panelSize, setPanelSize] = useState({ height: 0, width: 0 })
  const panelState = useEditorStore((state) => state.floatingPanels[id])
  const focusFloatingPanel = useEditorStore((state) => state.focusFloatingPanel)
  const setFloatingPanelDragging = useEditorStore(
    (state) => state.setFloatingPanelDragging
  )
  const setFloatingPanelOffset = useEditorStore(
    (state) => state.setFloatingPanelOffset
  )

  useLayoutEffect(() => {
    const updateViewportSize = () => {
      setViewportSize((current) => {
        const next = getViewportSize()

        if (current.width === next.width && current.height === next.height) {
          return current
        }

        return next
      })
    }

    const panel = panelRef.current

    if (!panel) {
      return
    }

    const updatePanelSize = () => {
      const rect = panel.getBoundingClientRect()

      setPanelSize((current) => {
        const next = {
          height: rect.height,
          width: rect.width,
        }

        if (
          Math.abs(current.width - next.width) <= 0.5 &&
          Math.abs(current.height - next.height) <= 0.5
        ) {
          return current
        }

        return next
      })
    }

    updateViewportSize()
    updatePanelSize()

    const resizeObserver = new ResizeObserver(() => {
      updatePanelSize()
    })

    resizeObserver.observe(panel)
    window.addEventListener("resize", updateViewportSize)
    window.addEventListener("resize", updatePanelSize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateViewportSize)
      window.removeEventListener("resize", updatePanelSize)
    }
  }, [])

  const isReady =
    viewportSize.width > 0 && panelSize.width > 0 && panelSize.height > 0

  const basePosition = isReady
    ? resolvePosition({
        panelHeight: panelSize.height,
        panelWidth: panelSize.width,
        viewportHeight: viewportSize.height,
        viewportWidth: viewportSize.width,
      })
    : { left: 0, top: 0 }

  const minLeft = VIEWPORT_MARGIN
  const maxLeft = Math.max(
    viewportSize.width - panelSize.width - VIEWPORT_MARGIN,
    VIEWPORT_MARGIN
  )
  const minTop = VIEWPORT_MARGIN
  const maxTop = Math.max(
    viewportSize.height - panelSize.height - VIEWPORT_MARGIN,
    VIEWPORT_MARGIN
  )

  const effectiveOffsetX = isReady
    ? Math.min(
        Math.max(panelState.x, minLeft - basePosition.left),
        maxLeft - basePosition.left
      )
    : 0
  const effectiveOffsetY = isReady
    ? Math.min(
        Math.max(panelState.y, minTop - basePosition.top),
        maxTop - basePosition.top
      )
    : 0

  useEffect(() => {
    return () => {
      dragStateRef.current = null
      setFloatingPanelDragging(null)
      document.body.style.userSelect = ""
    }
  }, [setFloatingPanelDragging])

  const dragHandleProps = {
    "data-floating-drag-handle": "true" as const,
    onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || isInteractiveTarget(event.target)) {
        return
      }

      focusFloatingPanel(id)
      setFloatingPanelDragging(id)
      dragStateRef.current = {
        pointerId: event.pointerId,
        startOffsetX: effectiveOffsetX,
        startOffsetY: effectiveOffsetY,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
      }

      document.body.style.userSelect = "none"
      event.currentTarget.setPointerCapture(event.pointerId)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentDragState = dragStateRef.current

        if (
          !currentDragState ||
          moveEvent.pointerId !== currentDragState.pointerId
        ) {
          return
        }

        const candidateOffsetX =
          currentDragState.startOffsetX +
          (moveEvent.clientX - currentDragState.startPointerX)
        const candidateOffsetY =
          currentDragState.startOffsetY +
          (moveEvent.clientY - currentDragState.startPointerY)

        const clampedOffsetX = Math.min(
          Math.max(candidateOffsetX, minLeft - basePosition.left),
          maxLeft - basePosition.left
        )
        const clampedOffsetY = Math.min(
          Math.max(candidateOffsetY, minTop - basePosition.top),
          maxTop - basePosition.top
        )

        setFloatingPanelOffset(id, clampedOffsetX, clampedOffsetY)
      }

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (
          !dragStateRef.current ||
          upEvent.pointerId !== dragStateRef.current.pointerId
        ) {
          return
        }

        dragStateRef.current = null
        setFloatingPanelDragging(null)
        document.body.style.userSelect = ""
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
        window.removeEventListener("pointercancel", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
      window.addEventListener("pointercancel", handlePointerUp)
    },
  }

  const panelStyle = {
    left: basePosition.left,
    opacity: isReady ? 1 : 0,
    pointerEvents: isReady ? undefined : "none",
    position: "fixed",
    top: basePosition.top,
    transform: `translate3d(${effectiveOffsetX}px, ${effectiveOffsetY}px, 0)`,
    transition: isReady ? "opacity 120ms ease-out" : undefined,
    visibility: isReady ? "visible" : "hidden",
    zIndex: 20 + panelState.z,
  } as CSSProperties

  return (
    <div
      className="pointer-events-none fixed hidden min-[900px]:block"
      onPointerDownCapture={() => {
        focusFloatingPanel(id)
      }}
    >
      <div className="pointer-events-auto" ref={panelRef} style={panelStyle}>
        {children({ dragHandleProps })}
      </div>
    </div>
  )
}
