"use client"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { getDocumentSize } from "@/lib/editor/composition"
import { resolveTextFontFamily, normalizeTextFontWeight } from "@/lib/editor/text-fonts"
import {
  textAnchorPlacement,
  textFontSize,
  textPivotPx,
} from "@/lib/editor/text-geometry"
import { resolveLineHeight, resolveTextAlign, resolveTextRotation } from "@/renderer/text-layout"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { canEditTextLayer, useTextEditStore } from "@/store/text-edit-store"

function shift(placement: "left" | "center" | "right" | "top" | "bottom"): string {
  if (placement === "left" || placement === "top") return "0%"
  if (placement === "right" || placement === "bottom") return "-100%"
  return "-50%"
}

export function TextEditOverlay({ disabled }: { disabled: boolean }) {
  const id = useTextEditStore((s) => s.layerId)
  const allowed = useLayerStore((s) => canEditTextLayer(s.layers, id))
  useEffect(() => {
    if (id && !allowed) useTextEditStore.getState().edit(null)
  }, [id, allowed])
  return id && allowed && !disabled ? <Editor key={id} id={id} /> : null
}

function Editor({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const layer = useLayerStore((s) => s.layers.find((l) => l.id === id))
  const sceneConfig = useEditorStore((s) => s.sceneConfig)
  const outputSize = useEditorStore((s) => s.outputSize)
  const canvasSize = useEditorStore((s) => s.canvasSize)
  const [box, setBox] = useState({ width: 1, height: 1 })
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const update = () =>
      setBox({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const finish = useCallback(
    (commit: boolean) => {
      const state = useTextEditStore.getState()
      if (state.layerId !== id) return
      if (!commit && state.original !== null)
        useLayerStore.getState().updateLayerParam(id, "text", state.original)
      state.edit(null)
    },
    [id]
  )
  useEffect(() => {
    const editor = useEditorStore.getState()
    editor.beginInteractiveEdit()
    const element = area.current
    element?.focus()
    element?.select()
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.sceneRevision !== previous.sceneRevision) finish(false)
    })
    return () => {
      unsubscribe()
      useEditorStore.getState().endInteractiveEdit()
    }
  }, [finish])
  if (!layer) return null
  const params = layer.params
  const logical = getDocumentSize(sceneConfig, outputSize) ?? canvasSize
  const scale = box.width / Math.max(1, logical.width)
  const [px, py] = textPivotPx(params, logical)
  const placement = textAnchorPlacement(params.anchor)
  const align = resolveTextAlign(params.align)
  const horizontal = align === "auto" ? placement.horizontal : align
  const fontSize = textFontSize(params) * scale
  const family = resolveTextFontFamily(
    typeof params.fontFamily === "string" ? params.fontFamily : "sans"
  )
  const weight = normalizeTextFontWeight(
    typeof params.fontFamily === "string" ? params.fontFamily : "sans",
    typeof params.fontWeight === "number" ? params.fontWeight : 700
  )
  const lineHeight = resolveLineHeight(params.lineHeight)
  const letterSpacing =
    typeof params.letterSpacing === "number" ? params.letterSpacing : -0.05
  const translateX = shift(horizontal)
  const translateY = shift(placement.vertical)
  const text = typeof params.text === "string" ? params.text : ""
  return (
    <div ref={host} className="absolute inset-0 z-30" data-text-edit-overlay="true">
      <textarea
        ref={area}
        aria-label="Edit text"
        className="absolute m-0 min-w-[2ch] resize-none overflow-hidden whitespace-pre border border-white/60 bg-transparent p-0 text-transparent caret-white outline-none shadow-[0_0_0_1px_rgba(0,0,0,0.6)] selection:bg-white/30"
        spellCheck={false}
        rows={Math.max(1, text.split("\n").length)}
        style={{
          left: px * scale,
          top: py * scale,
          transform: `translate(${translateX}, ${translateY}) rotate(${resolveTextRotation(params.rotation)}deg)`,
          transformOrigin: horizontal,
          fontFamily: family,
          fontWeight: weight,
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          letterSpacing: `${letterSpacing}em`,
          textAlign: horizontal,
          width: `${Math.max(2, ...text.split("\n").map((l) => l.length)) + 1}ch`,
        }}
        value={text}
        onChange={(event) =>
          useLayerStore.getState().updateLayerParam(id, "text", event.currentTarget.value)
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            finish(false)
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            finish(true)
          }
          event.stopPropagation()
        }}
        onBlur={() => finish(true)}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </div>
  )
}
