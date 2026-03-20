import { EditorCanvasViewport } from "@/features/editor/components/editor-canvas-viewport"
import { EditorTimelineOverlay } from "@/features/editor/components/editor-timeline-overlay"
import { EditorTopBar } from "@/features/editor/components/editor-topbar"
import { LayerSidebar } from "@/features/editor/components/layer-sidebar"
import { PropertiesSidebar } from "@/features/editor/components/properties-sidebar"

export default function HomePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[var(--ds-color-canvas)]">
      <EditorCanvasViewport />
      <EditorTimelineOverlay />
      <EditorTopBar />
      <LayerSidebar />
      <PropertiesSidebar />
    </main>
  )
}
