import { requestAutosave } from "@/lib/editor/autosave/bus"
import { withAutosaveSuppressed } from "@/lib/editor/autosave/suppress"
import {
  applyLabProjectFile,
  type LabProjectFile,
} from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"
import { useDraftStore } from "@/store/draft-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"

export function applyRemixedScene(
  projectFile: LabProjectFile,
  scene: { slug: string; title: string }
): void {
  withAutosaveSuppressed(() => {
    applyLabProjectFile(projectFile, useAssetStore.getState().assets)
    useRemixOriginStore.getState().setRemixOrigin({
      slug: scene.slug,
      title: scene.title,
    })
    useDraftStore.getState().clearActiveDraft()
  })

  requestAutosave()

  void fetch(`/api/community/scenes/${scene.slug}/remix`, {
    method: "POST",
  }).catch(() => undefined)
}
