import * as Sentry from "@sentry/nextjs"
import { gpuSnapshot } from "@/lib/webgpu-diagnostics"

export type BootStage =
  | "webgpu-probed"
  | "renderer-created"
  | "device-ready"
  | "first-frame"

const toSeconds = (ms: number) => Number((ms / 1000).toFixed(2))

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

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
}

/**
 * One instance per boot, created by the renderer effect. Module-level state
 * would survive a remount and file a timeout for the previous mount's clock.
 */
export class RendererBootTrace {
  private startedAt = 0
  private wasHidden = false
  private recoveryReported = false
  private readonly marks: Partial<Record<BootStage, number>> = {}

  private visibleSince: number | null = null
  private visibleAccum = 0

  private budgetMs = 0
  private onExpire: (() => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private expired = false

  private readonly syncVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.wasHidden = true

      if (this.visibleSince !== null) {
        this.visibleAccum += performance.now() - this.visibleSince
        this.visibleSince = null
      }

      this.disarm()
      return
    }

    if (this.visibleSince === null) {
      this.visibleSince = performance.now()
      this.arm()
    }
  }

  start(): void {
    if (this.startedAt === 0) {
      this.startedAt = performance.now()
    }

    document.addEventListener("visibilitychange", this.syncVisibility)
    this.syncVisibility()
  }

  /**
   * Charged only while the tab is visible: a backgrounded tab gets throttled
   * rAF, so wall-clock time would report a failure nobody saw.
   */
  armDeadline(budgetMs: number, onExpire: () => void): void {
    this.budgetMs = budgetMs
    this.onExpire = onExpire
    this.arm()
  }

  /** Boot reached a terminal state; stop the deadline re-arming on refocus. */
  settleDeadline(): void {
    this.onExpire = null
    this.disarm()
  }

  dispose(): void {
    document.removeEventListener("visibilitychange", this.syncVisibility)
    this.settleDeadline()
  }

  mark(stage: BootStage): void {
    if (this.marks[stage] !== undefined) {
      return
    }

    this.marks[stage] = toSeconds(performance.now() - this.startedAt)
    Sentry.addBreadcrumb({
      category: "renderer.boot",
      data: { atSec: this.marks[stage] },
      level: "info",
      message: stage,
    })
  }

  captureTimeout(sceneInfo: Record<string, unknown>): void {
    this.capture("Renderer boot timed out", "warning", {
      context: { budgetSec: toSeconds(this.budgetMs), ...sceneInfo },
      tags: { "boot.last_stage": this.lastStage() },
    })
  }

  /** No-ops unless the deadline expired: nothing to recover from otherwise. */
  captureRecovery(): void {
    if (this.recoveryReported || !this.expired) {
      return
    }

    this.recoveryReported = true
    this.capture("Renderer boot recovered after timeout", "info")
  }

  private capture(
    message: string,
    level: "info" | "warning",
    extra: {
      context?: Record<string, unknown>
      tags?: Record<string, string>
    } = {}
  ): void {
    const nav = navigator as NavigatorWithHints
    const device = {
      cpuCores: nav.hardwareConcurrency,
      deviceMemoryGb: nav.deviceMemory,
      dpr: window.devicePixelRatio,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }
    const gpu = gpuSnapshot()

    Sentry.captureMessage(message, {
      contexts: {
        renderer_boot: {
          elapsedSec: toSeconds(performance.now() - this.startedAt),
          // Copied: Sentry serializes async, so a later stage would look earlier.
          marks: { ...this.marks },
          visibleSec: toSeconds(this.visibleElapsed()),
          ...extra.context,
        },
        renderer_boot_device: device,
        renderer_boot_gpu: gpu,
      },
      level,
      tags: {
        "boot.automated": String(navigator.webdriver === true),
        "boot.was_hidden": String(this.wasHidden),
        "device.memory_bucket": memoryBucket(device.deviceMemoryGb),
        "gpu.adapter_acquired": String(gpu.adapterAcquired),
        ...extra.tags,
      },
    })
  }

  private visibleElapsed(): number {
    return Math.round(
      this.visibleAccum +
        (this.visibleSince === null ? 0 : performance.now() - this.visibleSince)
    )
  }

  /** Written once per stage, so key order is already chronological. */
  private lastStage(): BootStage | "none" {
    const seen = Object.keys(this.marks) as BootStage[]
    return seen[seen.length - 1] ?? "none"
  }

  private arm(): void {
    // `expired` never resets: re-arming after expiry would file twice.
    if (this.expired || this.onExpire === null) {
      return
    }

    if (this.visibleSince === null || this.timer !== null) {
      return
    }

    this.timer = setTimeout(
      () => {
        this.timer = null
        this.expired = true
        this.onExpire?.()
      },
      Math.max(0, this.budgetMs - this.visibleElapsed())
    )
  }

  private disarm(): void {
    if (this.timer === null) {
      return
    }

    clearTimeout(this.timer)
    this.timer = null
  }
}
