import { Suspense } from "react"
import { AgentBridgeMount } from "@/components/editor/agent-bridge-mount"
import { AutosaveMount } from "@/components/editor/autosave-mount"
import { DraftSaveMount } from "@/components/editor/draft-save-mount"
import { EditorCanvasViewport } from "@/components/editor/editor-canvas-viewport"
import { MobileEditorDock } from "@/components/editor/mobile-editor-dock"
import { EditorShortcuts } from "@/components/editor/editor-shortcuts"
import { EditorTimelineOverlay } from "@/components/editor/editor-timeline-overlay"
import { EditorTopBar } from "@/components/editor/editor-topbar"
import { LayerSidebar } from "@/components/editor/layer-sidebar"
import { PropertiesSidebar } from "@/components/editor/properties-sidebar"
import {
  SCENE_LOADING_OVERLAY_ID,
  SceneDeepLinkMount,
} from "@/components/editor/scene-deep-link-mount"
import { getDefaultProjectPreloadUrls } from "@/lib/editor/default-project"

/* Runs while the static HTML is still parsing, long before hydration:
 * reveals the scene-loading overlay so a `?scene=` deep link never
 * paints the starter scene's sidebars and timeline. */
const SCENE_OVERLAY_BOOT_SCRIPT = `if(new URLSearchParams(location.search).has("scene")){var o=document.getElementById(${JSON.stringify(
  SCENE_LOADING_OVERLAY_ID
)});if(o)o.dataset.active="true"}`

/* Also parse-time: starts the video fetch before the bundle runs. Skipped for
 * `?scene=` deep links, which replace the starter scene. */
const STARTER_MEDIA_PRELOAD_SCRIPT = `if(!new URLSearchParams(location.search).has("scene")){${JSON.stringify(
  getDefaultProjectPreloadUrls()
)}.forEach(function(u){var l=document.createElement("link");l.rel="preload";l.as="video";l.href=u;l.crossOrigin="anonymous";document.head.appendChild(l)})}`

function StarterMediaPreload() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time constant, no user input
      dangerouslySetInnerHTML={{ __html: STARTER_MEDIA_PRELOAD_SCRIPT }}
    />
  )
}

function SceneLoadingOverlay() {
  return (
    <>
      <div
        className="fixed inset-0 z-90 hidden items-center justify-center bg-[#050507] data-[active=true]:flex"
        id={SCENE_LOADING_OVERLAY_ID}
        suppressHydrationWarning
      >
        <div className="flex flex-col items-center gap-4">
          <div
            aria-hidden="true"
            className="relative h-[3px] w-[min(220px,32vw)] overflow-hidden rounded-full bg-white/12"
          >
            <div className="absolute inset-y-0 left-0 w-[38%] animate-[loader-bounce_0.9s_cubic-bezier(0.65,0,0.35,1)_infinite_alternate] rounded-full bg-white/72 shadow-[0_0_18px_rgba(255,255,255,0.18)]" />
          </div>
          <p
            className="text-[12px] text-[var(--ds-color-text-tertiary)] leading-5"
            data-scene-overlay-message=""
          >
            Opening scene…
          </p>
        </div>
      </div>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static constant, no user input
        dangerouslySetInnerHTML={{ __html: SCENE_OVERLAY_BOOT_SCRIPT }}
      />
    </>
  )
}

export function ShaderLabPage({
  communityEnabled,
}: {
  communityEnabled: boolean
}) {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-[var(--ds-color-canvas)]"
    >
      <StarterMediaPreload />
      <AgentBridgeMount />
      <AutosaveMount />
      <DraftSaveMount />
      <EditorShortcuts />
      <EditorCanvasViewport />
      {/* Own boundaries so selective hydration can prioritize the canvas
          instead of hydrating the whole editor as one unit. */}
      <Suspense fallback={null}>
        <EditorTimelineOverlay />
      </Suspense>
      <Suspense fallback={null}>
        <EditorTopBar communityEnabled={communityEnabled} />
      </Suspense>
      <Suspense fallback={null}>
        <LayerSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <PropertiesSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <MobileEditorDock />
      </Suspense>
      {communityEnabled ? (
        <>
          <SceneLoadingOverlay />
          <SceneDeepLinkMount />
        </>
      ) : null}
    </main>
  )
}
