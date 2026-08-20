import * as Sentry from "@sentry/nextjs"
import { gpuSnapshot } from "@/lib/webgpu-diagnostics"

// One boot per page load; a retry-boot feature would need the one-shot guards
// (`marks`, `deadlineFired`) revisited.
export type BootStage =
  | "webgpu-probed"
  | "renderer-created"
  | "device-ready"
  | "first-frame"

let startedAt = 0
let wasHidden = false
let recoveryReported = false
const marks: Partial<Record<BootStage, number>> = {}

let visibleSince: number | null = null
let visibleAccum = 0

let deadlineBudget = 0
let deadlineExpire: (() => void) | null = null
let deadlineTimer: ReturnType<typeof setTimeout> | null = null
let deadlineFired = false
let subscribed = false

const visibleElapsed = () =>
  Math.round(
    visibleAccum +
      (visibleSince === null ? 0 : performance.now() - visibleSince)
  )

const toSeconds = (ms: number) => Number((ms / 1000).toFixed(2))

const armDeadline = () => {
  if (deadlineFired || deadlineExpire === null) {
    return
  }

  if (visibleSince === null || deadlineTimer !== null) {
    return
  }

  deadlineTimer = setTimeout(
    () => {
      deadlineTimer = null
      deadlineFired = true
      deadlineExpire?.()
    },
    Math.max(0, deadlineBudget - visibleElapsed())
  )
}

const disarmDeadline = () => {
  if (deadlineTimer === null) {
    return
  }

  clearTimeout(deadlineTimer)
  deadlineTimer = null
}

const syncVisibility = () => {
  if (document.visibilityState === "hidden") {
    wasHidden = true

    if (visibleSince !== null) {
      visibleAccum += performance.now() - visibleSince
      visibleSince = null
    }

    disarmDeadline()
    return
  }

  if (visibleSince === null) {
    visibleSince = performance.now()
    armDeadline()
  }
}

export const startRendererBootTrace = () => {
  if (startedAt === 0) {
    startedAt = performance.now()
    wasHidden = document.visibilityState === "hidden"
    visibleSince = wasHidden ? null : startedAt
  }

  if (subscribed) {
    return
  }

  subscribed = true
  document.addEventListener("visibilitychange", syncVisibility)
  syncVisibility()
}

// Charged only while the tab is visible: a backgrounded tab gets throttled rAF,
// so wall-clock time there would report a failure nobody saw.
export const armRendererBootDeadline = (
  budgetMs: number,
  onExpire: () => void
) => {
  // deadlineFired never resets: re-arming after expiry would file twice.
  deadlineBudget = budgetMs
  deadlineExpire = onExpire
  armDeadline()
}

export const stopRendererBootTrace = () => {
  document.removeEventListener("visibilitychange", syncVisibility)
  disarmDeadline()
  deadlineExpire = null
  subscribed = false
}

export const markBootStage = (stage: BootStage) => {
  if (marks[stage] !== undefined) {
    return
  }

  if (startedAt === 0) {
    startRendererBootTrace()
  }

  marks[stage] = toSeconds(performance.now() - startedAt)
  Sentry.addBreadcrumb({
    category: "renderer.boot",
    data: { atSec: marks[stage] },
    level: "info",
    message: stage,
  })
}

// Written once per stage, so key order is already chronological.
const lastStage = (): BootStage | "none" => {
  const seen = Object.keys(marks) as BootStage[]
  return seen[seen.length - 1] ?? "none"
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
}

const deviceSnapshot = () => {
  const nav = navigator as NavigatorWithHints

  return {
    cpuCores: nav.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  }
}

const memoryBucket = (gb: number | undefined) => {
  if (gb === undefined) {
    return "unknown"
  }

  if (gb <= 2) {
    return "<=2"
  }

  if (gb <= 4) {
    return "4"
  }

  return ">=8"
}

const commonFields = () => {
  const device = deviceSnapshot()
  const gpu = gpuSnapshot()

  return {
    contexts: { renderer_boot_device: device, renderer_boot_gpu: gpu },
    gpu,
    tags: {
      "boot.was_hidden": String(wasHidden),
      "boot.automated": String(navigator.webdriver === true),
      "device.memory_bucket": memoryBucket(device.deviceMemoryGb),
      "gpu.adapter_acquired": String(gpu.adapterAcquired),
    },
  }
}

export const captureRendererBootTimeout = (
  budgetMs: number,
  sceneInfo: Record<string, unknown>
) => {
  if (startedAt === 0) {
    return
  }

  const elapsedSec = toSeconds(performance.now() - startedAt)
  const { tags, contexts } = commonFields()

  Sentry.captureMessage("Renderer boot timed out", {
    contexts: {
      // Copied: Sentry serializes async, so a later stage would look earlier.
      renderer_boot: {
        budgetSec: toSeconds(budgetMs),
        elapsedSec,
        marks: { ...marks },
        visibleSec: toSeconds(visibleElapsed()),
        ...sceneInfo,
      },
      ...contexts,
    },
    level: "warning",
    tags: { ...tags, "boot.last_stage": lastStage() },
  })
}

export const captureRendererBootRecovery = () => {
  // Guarded on deadlineFired so callers can fire it on every good frame.
  if (startedAt === 0 || recoveryReported || !deadlineFired) {
    return
  }

  recoveryReported = true

  const { tags, contexts } = commonFields()

  Sentry.captureMessage("Renderer boot recovered after timeout", {
    contexts: {
      renderer_boot: {
        elapsedSec: toSeconds(performance.now() - startedAt),
        marks: { ...marks },
        visibleSec: toSeconds(visibleElapsed()),
      },
      ...contexts,
    },
    level: "info",
    tags,
  })
}

export const bootMarks = () => ({ ...marks })
