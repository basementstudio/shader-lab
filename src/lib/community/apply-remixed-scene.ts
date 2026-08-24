import { requestAutosave } from "@/lib/editor/autosave/bus"
import { withAutosaveSuppressed } from "@/lib/editor/autosave/suppress"
import { armRemixDraft } from "@/lib/editor/remix-draft"
import {
  applyLabProjectFile,
  type LabProjectFile,
} from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"
import { useDraftStore } from "@/store/draft-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"

function remixDraftTitle(title: string): string {
  const trimmed = title.trim()

  if (trimmed.length === 0) {
    return "Remix"
  }

  return /\bremix$/i.test(trimmed) ? trimmed : `${trimmed} remix`
}

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

  armRemixDraft({ title: remixDraftTitle(scene.title) })
}
