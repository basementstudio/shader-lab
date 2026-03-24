import { EditorCanvasViewport } from "@/components/editor/editor-canvas-viewport"
import { EditorTimelineOverlay } from "@/components/editor/editor-timeline-overlay"
import { EditorTopBar } from "@/components/editor/editor-topbar"
import { LayerSidebar } from "@/components/editor/layer-sidebar"
import { PropertiesSidebar } from "@/components/editor/properties-sidebar"

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-[var(--ds-color-canvas)]"
    >
      <EditorCanvasViewport />
      <EditorTimelineOverlay />
      <EditorTopBar />
      <LayerSidebar />
      <PropertiesSidebar />
    </main>
  )
}
