import * as Sentry from "@sentry/nextjs"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer } from "@/types/editor"

export type LayerMeta = { kind: EditorLayer["kind"]; type: EditorLayer["type"] }

export type PassFailureSurface = "pass-render" | "pipeline-compile"

// "contain" runs user-authored code, so its failures are expected input rather
// than defects and must never become Sentry issues.
export type PassFailureHandling = "capture" | "contain"

export function classifyPassFailure(
  meta: LayerMeta | undefined
): PassFailureHandling {
  return meta?.type === "custom-shader" ? "contain" : "capture"
}

export type PassFailureState = { count: number; fingerprint: string }

export type PassFailureDecision = {
  disable: boolean
  report: boolean
  state: PassFailureState
}

// A pass that throws while anything needs continuous rendering throws ~60x a
// second: report once per fingerprint, then drop the pass from the composite.
export function nextPassFailureState(
  previous: PassFailureState | undefined,
  fingerprint: string,
  maxFailures: number
): PassFailureDecision {
  const count = previous?.fingerprint === fingerprint ? previous.count + 1 : 1

  return {
    disable: count >= maxFailures,
    report: count === 1,
    state: { count, fingerprint },
  }
}

export function errorFingerprint(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }

  return [error.name, error.message, error.stack?.split("\n")[1]?.trim()].join(
    "|"
  )
}

export function reportPassFailure(
  meta: LayerMeta | undefined,
  layerId: string,
  surface: PassFailureSurface,
  error: unknown,
  fallback: string
): void {
  const message = error instanceof Error ? error.message : fallback

  if (classifyPassFailure(meta) === "contain") {
    useLayerStore.getState().setLayerRuntimeError(layerId, message)
    Sentry.addBreadcrumb({
      category: "shader.compile",
      data: { layerId, surface },
      level: "warning",
      message,
    })
    return
  }

  Sentry.captureException(error, {
    tags: { "layer.type": meta?.type ?? "unknown", surface },
  })
}
