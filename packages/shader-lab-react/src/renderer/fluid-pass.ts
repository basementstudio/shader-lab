import type * as THREE from "three/webgpu"
import { float, texture as tslTexture, uv, vec2, vec4 } from "three/tsl"
import {
  defaultShaderLabFluidControls,
  type ShaderLabFluidControls,
} from "../fluid/types"
import { ShaderLabFluidRuntime } from "../fluid/runtime"
import { PassNode, createPipelinePlaceholder } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

export class FluidPass extends PassNode {
  private readonly runtime: ShaderLabFluidRuntime
  private initPromise: Promise<void> | null = null
  private readonly placeholder = createPipelinePlaceholder()
  private readonly outputTextureNode = tslTexture(
    this.placeholder,
    vec2(uv().x, float(1).sub(uv().y))
  )
  private readonly canvas: HTMLCanvasElement | null
  private readonly onPointerMove: ((event: PointerEvent) => void) | null
  private readonly onPointerLeave: (() => void) | null
  private lastPointerX: number | null = null
  private lastPointerY: number | null = null

  constructor(layerId: string, renderer: THREE.WebGPURenderer) {
    super(layerId)
    this.runtime = new ShaderLabFluidRuntime({ renderer })
    this.initPromise = this.runtime.initialize().then(() => {
      this.runtime.start()
      this.initPromise = null
    })

    const domElement = (renderer as unknown as { domElement?: HTMLCanvasElement })
      .domElement ?? null
    this.canvas = domElement
    if (domElement) {
      this.onPointerMove = (event: PointerEvent) => {
        this.handlePointerMove(event, domElement)
      }
      this.onPointerLeave = () => {
        this.lastPointerX = null
        this.lastPointerY = null
      }
      domElement.addEventListener("pointermove", this.onPointerMove)
      domElement.addEventListener("pointerleave", this.onPointerLeave)
      domElement.addEventListener("pointerdown", this.onPointerMove)
    } else {
      this.onPointerMove = null
      this.onPointerLeave = null
    }

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (this.runtime.isReady) {
      this.runtime.step(delta)
      this.outputTextureNode.value =
        this.runtime.outputTexture ?? this.placeholder
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.runtime.updateControls(resolveFluidControls(params))
  }

  override resize(width: number, height: number): void {
    this.runtime.resize(width, height)
  }

  override needsContinuousRender(): boolean {
    return (
      this.initPromise !== null ||
      (this.runtime.isRunning && !this.runtime.currentControls.paused)
    )
  }

  override dispose(): void {
    if (this.canvas && this.onPointerMove) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove)
      this.canvas.removeEventListener("pointerdown", this.onPointerMove)
    }
    if (this.canvas && this.onPointerLeave) {
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave)
    }
    this.runtime.dispose()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode() {
    if (!this.outputTextureNode) {
      return this.inputNode
    }
    return vec4(this.outputTextureNode.rgb, float(1))
  }

  private handlePointerMove(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): void {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }

    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const ux = localX / rect.width
    const uy = 1 - localY / rect.height

    if (this.lastPointerX !== null && this.lastPointerY !== null) {
      const force = this.runtime.currentControls.splatForce
      const dx = ((localX - this.lastPointerX) / rect.width) * force
      const dy = -((localY - this.lastPointerY) / rect.height) * force
      if (dx !== 0 || dy !== 0) {
        this.runtime.splat(ux, uy, dx, dy)
      }
    }

    this.lastPointerX = localX
    this.lastPointerY = localY
  }
}

function resolveFluidControls(
  params: LayerParameterValues
): Partial<ShaderLabFluidControls> {
  return {
    autoSplats:
      typeof params.autoSplats === "boolean"
        ? params.autoSplats
        : defaultShaderLabFluidControls.autoSplats,
    brightness:
      typeof params.brightness === "number"
        ? params.brightness
        : defaultShaderLabFluidControls.brightness,
    colorMode:
      params.colorMode === "duotone" ||
      params.colorMode === "source" ||
      params.colorMode === "monochrome"
        ? params.colorMode
        : defaultShaderLabFluidControls.colorMode,
    curlStrength:
      typeof params.curlStrength === "number"
        ? params.curlStrength
        : defaultShaderLabFluidControls.curlStrength,
    densityDissipation:
      typeof params.densityDissipation === "number"
        ? params.densityDissipation
        : defaultShaderLabFluidControls.densityDissipation,
    dyeRes:
      typeof params.dyeRes === "number"
        ? params.dyeRes
        : defaultShaderLabFluidControls.dyeRes,
    duotoneDark:
      typeof params.duotoneDark === "string"
        ? params.duotoneDark
        : defaultShaderLabFluidControls.duotoneDark,
    duotoneLight:
      typeof params.duotoneLight === "string"
        ? params.duotoneLight
        : defaultShaderLabFluidControls.duotoneLight,
    iterations:
      typeof params.iterations === "number"
        ? params.iterations
        : defaultShaderLabFluidControls.iterations,
    monoDark:
      typeof params.monoDark === "string"
        ? params.monoDark
        : defaultShaderLabFluidControls.monoDark,
    monoLight:
      typeof params.monoLight === "string"
        ? params.monoLight
        : defaultShaderLabFluidControls.monoLight,
    paused:
      typeof params.paused === "boolean"
        ? params.paused
        : defaultShaderLabFluidControls.paused,
    pressureDissipation:
      typeof params.pressureDissipation === "number"
        ? params.pressureDissipation
        : defaultShaderLabFluidControls.pressureDissipation,
    radius:
      typeof params.radius === "number"
        ? params.radius
        : defaultShaderLabFluidControls.radius,
    seed:
      typeof params.seed === "number"
        ? params.seed
        : defaultShaderLabFluidControls.seed,
    simRes:
      typeof params.simRes === "number"
        ? params.simRes
        : defaultShaderLabFluidControls.simRes,
    splatForce:
      typeof params.splatForce === "number"
        ? params.splatForce
        : defaultShaderLabFluidControls.splatForce,
    velocityDissipation:
      typeof params.velocityDissipation === "number"
        ? params.velocityDissipation
        : defaultShaderLabFluidControls.velocityDissipation,
  }
}
