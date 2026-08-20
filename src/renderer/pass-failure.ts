import * as Sentry from "@sentry/nextjs"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer } from "@/types/editor"

export type LayerType = EditorLayer["type"]

export type PassFailureSurface =
  | "build-effect-node"
  | "pass-render"
  | "pipeline-compile"

const FALLBACK_MESSAGE: Record<PassFailureSurface, string> = {
  "build-effect-node": "Custom shader execution failed.",
  "pass-render": "Layer failed to render.",
  "pipeline-compile": "Shader compilation failed.",
}

// "contain" runs user-authored code, so its failures are expected input rather
// than defects and must never become Sentry issues.
export type PassFailureHandling = "capture" | "contain"

export function classifyPassFailure(
  type: LayerType | undefined
): PassFailureHandling {
  return type === "custom-shader" ? "contain" : "capture"
}

export type PassFailureState = { count: number; fingerprint: string }

// A pass that throws while anything needs continuous rendering throws ~60x a
// second, so callers report only on count === 1 and disable at a ceiling.
export function nextPassFailureState(
  previous: PassFailureState | undefined,
  fingerprint: string
): PassFailureState {
  return previous?.fingerprint === fingerprint
    ? { count: previous.count + 1, fingerprint }
    : { count: 1, fingerprint }
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
  type: LayerType | undefined,
  layerId: string,
  surface: PassFailureSurface,
  error: unknown
): void {
  const message =
    error instanceof Error ? error.message : FALLBACK_MESSAGE[surface]

  if (classifyPassFailure(type) === "contain") {
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
    tags: { "layer.type": type ?? "unknown", surface },
  })
}
