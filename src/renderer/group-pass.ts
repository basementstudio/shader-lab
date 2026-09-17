import { float, texture, type TSLNode, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "./pass-node"

export type RenderChildPass = (
  pass: PassNode,
  input: THREE.Texture,
  output: THREE.WebGLRenderTarget,
  time: number,
  delta: number,
  timelineTime: number
) => boolean

/** Owns only its intermediate targets; the pipeline owns all child passes. */
export class GroupPass extends PassNode {
  private children: PassNode[] = []
  private readonly rtA: THREE.WebGLRenderTarget
  private readonly rtB: THREE.WebGLRenderTarget
  private readonly groupInput: TSLNode
  private readonly clearColor = new THREE.Color()

  constructor(
    id: string,
    private readonly isActive: (pass: PassNode) => boolean,
    private readonly renderChild: RenderChildPass
  ) {
    super(id)
    const options = {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    }
    this.rtA = new THREE.WebGLRenderTarget(1, 1, options)
    this.rtB = new THREE.WebGLRenderTarget(1, 1, options)
    this.groupInput = texture(
      this.rtA.texture,
      vec2(uv().x, float(1).sub(uv().y))
    )
    this.updateCompositionRole("source")
    this.rebuildEffectNode()
  }

  setChildren(children: PassNode[]): boolean {
    if (
      children.length === this.children.length &&
      children.every((pass, i) => pass === this.children[i])
    )
      return false
    this.children = children
    return true
  }

  override resize(width: number, height: number): void {
    this.rtA.setSize(width, height)
    this.rtB.setSize(width, height)
  }

  override needsContinuousRender(): boolean {
    return this.children.some(
      (pass) => this.isActive(pass) && pass.needsContinuousRender()
    )
  }

  override async prepareForExportFrame(
    time: number,
    loop: boolean
  ): Promise<void> {
    await Promise.all(
      this.children
        .filter(this.isActive)
        .map((pass) => pass.prepareForExportFrame(time, loop))
    )
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    timelineTime = time
  ): void {
    // Never seed a group with the parent image or the opaque scene background.
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    try {
      renderer.setRenderTarget(this.rtA)
      renderer.setClearColor(0, 0)
      renderer.clear()
    } finally {
      renderer.setClearColor(this.clearColor, alpha)
    }

    let read = this.rtA
    let write = this.rtB
    for (const pass of this.children) {
      if (
        !(
          this.isActive(pass) &&
          this.renderChild(pass, read.texture, write, time, delta, timelineTime)
        )
      )
        continue
      ;[read, write] = [write, read]
    }
    this.groupInput.value = read.texture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override buildEffectNode(): TSLNode {
    return this.groupInput ?? this.inputNode
  }

  override dispose(): void {
    this.rtA.dispose()
    this.rtB.dispose()
    this.children = []
    super.dispose()
  }
}
