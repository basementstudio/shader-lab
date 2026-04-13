import { EditorCanvasViewport } from "@/components/editor/editor-canvas-viewport"
import { MobileEditorDock } from "@/components/editor/mobile-editor-dock"
import { EditorShortcuts } from "@/components/editor/editor-shortcuts"
import { EditorTimelineOverlay } from "@/components/editor/editor-timeline-overlay"
import { EditorTopBar } from "@/components/editor/editor-topbar"
import { LayerSidebar } from "@/components/editor/layer-sidebar"
import { PropertiesSidebar } from "@/components/editor/properties-sidebar"

export function ShaderLabPage() {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-[var(--ds-color-canvas)]"
    >
      <EditorShortcuts />
      <EditorCanvasViewport />
      <EditorTimelineOverlay />
      <EditorTopBar />
      <LayerSidebar />
      <PropertiesSidebar />
      <MobileEditorDock />
    </main>
  )
}
