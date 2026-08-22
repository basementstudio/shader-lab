"use client"

import { useEffect, useSyncExternalStore } from "react"
import { ShaderConsentDialog } from "@/components/community/shader-consent-dialog"
import { applyRemixedScene } from "@/lib/community/apply-remixed-scene"
import { scenePagePath } from "@/lib/community/scene-links"
import type { CommunitySceneDetail } from "@/lib/community/scenes"
import {
  hasImportedCustomShaderCode,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import {
  clearRequestedSceneSlug,
  getRequestedSceneSlug,
} from "@/lib/editor/requested-scene-slug"
import { useEditorStore } from "@/store/editor-store"

export const SCENE_LOADING_OVERLAY_ID = "scene-loading-overlay"

const PENDING_SCENE_TIMEOUT_MS = 20_000

const ERROR_REVEAL_DELAY_MS = 2_400

function fetchSceneDetail(slug: string): Promise<CommunitySceneDetail | null> {
  return fetch(`/api/community/scenes/${encodeURIComponent(slug)}`)
    .then((res) => res.json() as Promise<{ scene?: CommunitySceneDetail }>)
    .then((data) => data.scene ?? null)
    .catch(() => null)
}

/* Kick the scene fetch off at module-evaluation time so it overlaps
 * hydration on a hard load instead of waiting for the mount effect. */
const prefetchedSlug = getRequestedSceneSlug()
const prefetchedScene = prefetchedSlug ? fetchSceneDetail(prefetchedSlug) : null

/* Module state, not component state: the load spans strict-mode remounts,
 * and the run's closures must not write to an unmounted instance. */
let activeRunSlug: string | null = null

type ConsentRequest = {
  resolve: (granted: boolean) => void
  title: string
}

let consentRequest: ConsentRequest | null = null
const consentListeners = new Set<() => void>()

function notifyConsentListeners(): void {
  for (const listener of consentListeners) {
    listener()
  }
}

function requestShaderConsent(title: string): Promise<boolean> {
  return new Promise((resolve) => {
    consentRequest = {
      resolve: (granted) => {
        consentRequest = null
        notifyConsentListeners()
        resolve(granted)
      },
      title,
    }
    notifyConsentListeners()
  })
}

function subscribeToConsent(listener: () => void): () => void {
  consentListeners.add(listener)

  return () => {
    consentListeners.delete(listener)
  }
}

function getConsentRequest(): ConsentRequest | null {
  return consentRequest
}

function getServerConsentRequest(): ConsentRequest | null {
  return null
}

function getOverlay(): HTMLElement | null {
  return document.getElementById(SCENE_LOADING_OVERLAY_ID)
}

function hideOverlay(): void {
  const overlay = getOverlay()

  if (overlay) {
    overlay.dataset.active = "false"
  }
}

function showOverlayError(message: string): void {
  const target = getOverlay()?.querySelector("[data-scene-overlay-message]")

  if (target) {
    target.textContent = message
  }
}

export function SceneDeepLinkMount() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentRequest,
    getServerConsentRequest
  )

  useEffect(() => {
    const slug = getRequestedSceneSlug()

    if (!slug) {
      hideOverlay()

      return
    }

    if (activeRunSlug === slug) {
      return
    }

    activeRunSlug = slug

    useEditorStore.getState().setPendingScene(slug)
    clearRequestedSceneSlug()

    const overlay = getOverlay()

    if (overlay) {
      overlay.dataset.active = "true"
    }

    const finish = () => {
      useEditorStore.getState().clearPendingScene()
      hideOverlay()
      activeRunSlug = null
    }

    /* Once the failsafe reveals the starter, the run is dead: applying the
     * scene later would clobber whatever the user has started editing. */
    let timedOut = false
    const failsafe = window.setTimeout(() => {
      timedOut = true
      finish()
    }, PENDING_SCENE_TIMEOUT_MS)

    const fail = () => {
      showOverlayError("That scene is no longer available.")
      window.setTimeout(finish, ERROR_REVEAL_DELAY_MS)
    }

    void (async () => {
      try {
        const scene = await (prefetchedSlug === slug && prefetchedScene
          ? prefetchedScene
          : fetchSceneDetail(slug))

        if (timedOut) {
          return
        }

        if (!scene) {
          fail()

          return
        }

        const res = await fetch(scene.labUrl)

        if (timedOut) {
          return
        }

        if (!res.ok) {
          fail()

          return
        }

        const projectFile = parseLabProjectFile(await res.text())

        if (timedOut) {
          return
        }

        if (hasImportedCustomShaderCode(projectFile)) {
          // Everything is loaded; nothing can hang anymore. Reading the
          // consent dialog may legitimately take longer than the failsafe.
          window.clearTimeout(failsafe)

          const granted = await requestShaderConsent(scene.title)

          if (!granted) {
            window.location.replace(scenePagePath(scene.slug))

            return
          }
        }

        applyRemixedScene(projectFile, scene)
        finish()
      } catch {
        if (!timedOut) {
          fail()
        }
      } finally {
        window.clearTimeout(failsafe)
      }
    })()
  }, [])

  if (!consent) {
    return null
  }

  return (
    <ShaderConsentDialog
      onCancel={() => consent.resolve(false)}
      onConfirm={() => consent.resolve(true)}
      open
      sceneTitle={consent.title}
    />
  )
}
