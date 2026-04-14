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
  desktopContainerClassName: string
  id: FloatingPanelId
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
  desktopContainerClassName,
  id,
}: FloatingDesktopPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startOffsetX: number
    startOffsetY: number
    startPointerX: number
    startPointerY: number
  } | null>(null)
  const [viewportSize, setViewportSize] = useState(() =>
    typeof window === "undefined" ? { height: 0, width: 0 } : getViewportSize()
  )
  const panelOffsetRef = useRef({ x: 0, y: 0 })
  const originPositionRef = useRef({ left: 0, top: 0 })
  const [panelSize, setPanelSize] = useState({ height: 0, width: 0 })
  const panelState = useEditorStore((state) => state.floatingPanels[id])
  const focusFloatingPanel = useEditorStore((state) => state.focusFloatingPanel)
  const setFloatingPanelDragging = useEditorStore(
    (state) => state.setFloatingPanelDragging
  )
  const setFloatingPanelOffset = useEditorStore(
    (state) => state.setFloatingPanelOffset
  )
  const isReady =
    viewportSize.width > 0 && panelSize.width > 0 && panelSize.height > 0

  panelOffsetRef.current = {
    x: panelState.x,
    y: panelState.y,
  }

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize(getViewportSize())
    }

    updateViewportSize()
    window.addEventListener("resize", updateViewportSize)

    return () => {
      window.removeEventListener("resize", updateViewportSize)
    }
  }, [])

  useLayoutEffect(() => {
    const panel = panelRef.current

    if (!panel) {
      return
    }

    const updatePanelMetrics = () => {
      const rect = panel.getBoundingClientRect()
      originPositionRef.current = {
        left: rect.left - panelOffsetRef.current.x,
        top: rect.top - panelOffsetRef.current.y,
      }
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

    updatePanelMetrics()

    const resizeObserver = new ResizeObserver(() => {
      updatePanelMetrics()
    })

    resizeObserver.observe(panel)
    window.addEventListener("resize", updatePanelMetrics)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updatePanelMetrics)
    }
  }, [])

  const baseLeft = originPositionRef.current.left
  const baseTop = originPositionRef.current.top

  const effectiveOffsetX = Math.min(
    Math.max(panelState.x, VIEWPORT_MARGIN - baseLeft),
    Math.max(
      viewportSize.width - panelSize.width - VIEWPORT_MARGIN - baseLeft,
      VIEWPORT_MARGIN - baseLeft
    )
  )
  const effectiveOffsetY = Math.min(
    Math.max(panelState.y, VIEWPORT_MARGIN - baseTop),
    Math.max(
      viewportSize.height - panelSize.height - VIEWPORT_MARGIN - baseTop,
      VIEWPORT_MARGIN - baseTop
    )
  )

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

        const candidateLeft =
          currentDragState.startOffsetX +
          (moveEvent.clientX - currentDragState.startPointerX)
        const candidateTop =
          currentDragState.startOffsetY +
          (moveEvent.clientY - currentDragState.startPointerY)
        const clampedOffsetX = Math.min(
          Math.max(candidateLeft, VIEWPORT_MARGIN - baseLeft),
          Math.max(
            viewportSize.width - panelSize.width - VIEWPORT_MARGIN - baseLeft,
            VIEWPORT_MARGIN - baseLeft
          )
        )
        const clampedOffsetY = Math.min(
          Math.max(candidateTop, VIEWPORT_MARGIN - baseTop),
          Math.max(
            viewportSize.height - panelSize.height - VIEWPORT_MARGIN - baseTop,
            VIEWPORT_MARGIN - baseTop
          )
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

  const outerStyle = {
    zIndex: 20 + panelState.z,
  } as CSSProperties

  const panelStyle = {
    opacity: isReady ? 1 : 0,
    pointerEvents: isReady ? undefined : "none",
    transform: `translate3d(${effectiveOffsetX}px, ${effectiveOffsetY}px, 0)`,
    transition: isReady ? "opacity 120ms ease-out" : undefined,
    visibility: isReady ? "visible" : "hidden",
  } as CSSProperties

  return (
    <div
      className={desktopContainerClassName}
      onPointerDownCapture={() => {
        focusFloatingPanel(id)
      }}
      style={outerStyle}
    >
      <div className="pointer-events-auto" ref={panelRef} style={panelStyle}>
        {children({ dragHandleProps })}
      </div>
    </div>
  )
}
