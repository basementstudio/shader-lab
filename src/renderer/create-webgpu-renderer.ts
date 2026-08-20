import * as Sentry from "@sentry/nextjs"
import * as THREE from "three/webgpu"
import {
  markDeviceLost,
  recordDeviceDiagnostics,
} from "@/lib/webgpu-diagnostics"
import type { EditorRenderer, RendererFrame } from "@/renderer/contracts"
import { PipelineManager } from "@/renderer/pipeline-manager"
import type { Size } from "@/types/editor"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

type GpuQueueLike = { onSubmittedWorkDone: () => Promise<unknown> }
type GpuDeviceLike = { destroy?: () => void; queue?: GpuQueueLike }

type DeviceLostInfo = { message: string; reason: string | null }
// Assignable on the instance, but absent from the bundled three/webgpu types.
type RendererWithDeviceLost = {
  onDeviceLost: (info: DeviceLostInfo) => void
}

function getGpuDevice(instance: THREE.WebGPURenderer): GpuDeviceLike | null {
  return (
    (instance as unknown as { backend?: { device?: GpuDeviceLike } }).backend
      ?.device ?? null
  )
}

function getGpuQueue(instance: THREE.WebGPURenderer): GpuQueueLike | null {
  const queue = getGpuDevice(instance)?.queue

  if (!queue || typeof queue.onSubmittedWorkDone !== "function") {
    return null
  }

  return queue
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement
): Promise<EditorRenderer> {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: false,
    canvas,
  })
  let pipeline: PipelineManager | null = null
  let currentPixelRatio = 1

  function toDeviceSize(size: Size): Size {
    return {
      height: Math.max(1, Math.round(size.height * currentPixelRatio)),
      width: Math.max(1, Math.round(size.width * currentPixelRatio)),
    }
  }

  function renderFrame(frame: RendererFrame) {
    if (!pipeline) {
      pipeline = new PipelineManager(renderer, toDeviceSize(frame.viewportSize))
    }

    pipeline.updateLogicalSize(frame.logicalSize)
    pipeline.updateBackgroundColor(frame.sceneConfig.backgroundColor)
    pipeline.updateSceneConfig(frame.sceneConfig)
    pipeline.updateOutputCropAspectRatio(frame.cropAspectRatio)
    pipeline.syncLayers([...frame.layers].reverse())
    pipeline.render(
      frame.clock.time,
      frame.clock.delta,
      frame.clock.timelineTime
    )
  }

  return {
    async initialize() {
      await renderer.init()

      const device = getGpuDevice(renderer)

      if (device) {
        recordDeviceDiagnostics(device as unknown as GPUDevice)
      }

      // three owns device.lost and already filters reason === "destroyed" (our
      // own destroyDevice during export teardown). Wrap rather than replace:
      // calling through preserves the renderer's _isDeviceLost flag.
      const deviceLostHost = renderer as unknown as RendererWithDeviceLost
      const reportDeviceLost = deviceLostHost.onDeviceLost.bind(renderer)
      deviceLostHost.onDeviceLost = (info) => {
        reportDeviceLost(info)
        markDeviceLost()
        Sentry.captureMessage("WebGPU device lost", {
          extra: { message: info.message },
          level: "error",
          tags: { "gpu.lost_reason": info.reason ?? "unknown" },
        })
      }
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).outputColorSpace = THREE.SRGBColorSpace
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).toneMapping = THREE.NoToneMapping
      renderer.setClearColor("#0a0d10", 1)
    },

    hasPendingCompilations() {
      return pipeline?.hasPendingCompilations() ?? false
    },

    hasPendingResources() {
      return (
        (pipeline?.hasPendingCompilations() ?? false) ||
        (pipeline?.hasPendingMediaLoads() ?? false)
      )
    },

    resize(size: Size, pixelRatio: number) {
      currentPixelRatio = pixelRatio
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
      pipeline?.resize(toDeviceSize(size))
    },

    render(frame: RendererFrame) {
      renderFrame(frame)
    },

    setPreviewFrozen(frozen: boolean) {
      pipeline?.setPreviewFrozen(frozen)
    },

    async waitForGpuIdle() {
      const queue = getGpuQueue(renderer)

      if (!queue) {
        return false
      }

      await queue.onSubmittedWorkDone()
      return true
    },

    async prepareForExportFrame(time: number, loop: boolean) {
      await pipeline?.prepareForExportFrame(time, loop)
    },

    exportFrame(frame: RendererFrame, _renderSize: Size): HTMLCanvasElement {
      renderFrame(frame)

      const w = canvas.width
      const h = canvas.height
      const snapshot = document.createElement("canvas")
      snapshot.width = w
      snapshot.height = h
      const ctx = snapshot.getContext("2d")!
      ctx.drawImage(canvas, 0, 0)

      return snapshot
    },

    dispose() {
      renderer.setAnimationLoop(null)
      pipeline?.dispose()
      renderer.dispose()
    },

    async destroyDevice() {
      const device = getGpuDevice(renderer)

      if (typeof device?.destroy !== "function") {
        return
      }

      try {
        await getGpuQueue(renderer)?.onSubmittedWorkDone()
        device.destroy()
      } catch {
        return
      }
    },
  }
}
