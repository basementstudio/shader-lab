import { withAutosaveRestore } from "@/lib/editor/autosave/suppress"
import { getBlankProjectFile } from "@/lib/editor/blank-project"
import { getDefaultProjectFile } from "@/lib/editor/default-project"
import { applyLabProjectFile } from "@/lib/editor/project-file"
import { disarmRemixDraft } from "@/lib/editor/remix-draft"
import { clearRequestedSceneSlug } from "@/lib/editor/requested-scene-slug"
import { useAssetStore } from "@/store/asset-store"
import { useDraftStore } from "@/store/draft-store"
import { useEditorStore } from "@/store/editor-store"
import { useHistoryStore } from "@/store/history-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"

export type ProjectStart = "blank" | "demo"

/** A new document owns its media and history; persisted older documents stay intact. */
export function replaceWithNewProject(kind: ProjectStart): void {
  const project =
    kind === "blank" ? getBlankProjectFile() : getDefaultProjectFile()
  withAutosaveRestore(() => {
    disarmRemixDraft()
    useDraftStore.getState().clearActiveDraft()
    useRemixOriginStore.getState().clearRemixOrigin()
    useAssetStore.getState().replaceAssets([])
    applyLabProjectFile(project, [])
    useHistoryStore.getState().clearHistory()
    useEditorStore.getState().resetView()
    clearRequestedSceneSlug()
  })
}

let starter: ((kind: ProjectStart) => void) | null = null

// Autosave owns the transition so a pending boot read cannot overwrite it.
export function registerProjectStarter(next: typeof starter): void {
  starter = next
}

export function startProject(kind: ProjectStart): void {
  starter?.(kind)
}
