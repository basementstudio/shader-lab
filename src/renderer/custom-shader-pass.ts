import { clamp, float, pow, texture as tslTexture, type TSLNode, uniform, uv, vec2, vec3, vec4 } from "three/tsl"
import * as THREE from "three/webgpu"
import { CUSTOM_SHADER_ENTRY_EXPORT } from "@/lib/editor/custom-shader/shared"
import { compileCustomShaderModule } from "@/renderer/custom-shader-runtime"
import { PassNode } from "@/renderer/pass-node"
import { useLayerStore } from "@/store/layer-store"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type TypedNode = TSLNode & { nodeType?: string | null }

export class CustomShaderPass extends PassNode {
  private compiledSketch: (() => Node) | null = null
  private compileRequestId = 0
  private lastCompileSignature = ""
  private readonly timeUniform: Node
  private readonly inputTextureNode: Node
  private isEffectMode = false

  constructor(layerId: string) {
    super(layerId, "source")
    this.timeUniform = uniform(0)
    this.inputTextureNode = tslTexture(
      new THREE.Texture(),
      vec2(uv().x, float(1).sub(uv().y))
    )
    this.rebuildEffectNode()
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override updateParams(params: LayerParameterValues): void {
    const nextEffectMode = params.effectMode === true
    const modeChanged = nextEffectMode !== this.isEffectMode
    this.isEffectMode = nextEffectMode
    this.setCompositionStrategy(this.isEffectMode ? "effect" : "source")

    if (modeChanged) {
      this.rebuildEffectNode()
    }

    const sourceCode =
      typeof params.sourceCode === "string" ? params.sourceCode : ""
    const entryExport =
      typeof params.entryExport === "string" && params.entryExport.trim()
        ? params.entryExport.trim()
        : CUSTOM_SHADER_ENTRY_EXPORT
    const sourceFileName =
      typeof params.sourceFileName === "string" ? params.sourceFileName : ""
    const sourceRevision =
      typeof params.sourceRevision === "number" ? params.sourceRevision : 0
    const compileSignature = [
      entryExport,
      this.isEffectMode ? "effect" : "source",
      sourceCode,
      sourceFileName,
      sourceRevision,
    ].join("\n")

    if (compileSignature === this.lastCompileSignature) {
      return
    }

    this.lastCompileSignature = compileSignature
    this.compileRequestId += 1
    const requestId = this.compileRequestId

    const extraScope: Record<string, Node> = {
      inputTexture: this.inputTextureNode,
      time: this.timeUniform,
    }

    void compileCustomShaderModule({
      entryExport,
      extraScope,
      fileName: sourceFileName || "custom-shader.ts",
      sourceCode,
    })
      .then((compiled) => {
        if (requestId !== this.compileRequestId) {
          return
        }

        this.compiledSketch = compiled.buildNode
        useLayerStore.getState().setLayerRuntimeError(this.layerId, null)
        this.rebuildEffectNode()
      })
      .catch((error) => {
        if (requestId !== this.compileRequestId) {
          return
        }

        this.compiledSketch = null
        useLayerStore
          .getState()
          .setLayerRuntimeError(
            this.layerId,
            error instanceof Error
              ? error.message
              : "Custom shader compilation failed."
          )
        this.rebuildEffectNode()
      })
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
    this.inputTextureNode.value = this.inputNode.value
  }

  protected override buildEffectNode(): Node {
    if (!this.compiledSketch) {
      return vec4(vec3(float(0), float(0), float(0)), float(1))
    }

    try {
      const outputNode = this.compiledSketch() as TypedNode
      const outputAlpha =
        outputNode.nodeType === "vec4"
          ? clamp(float(outputNode.a), float(0), float(1))
          : float(1)
      const clampedRgb = clamp(
        outputNode.rgb ?? vec3(outputNode),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1))
      )

      // In effect mode the input is already linear — skip sRGB→linear conversion
      const finalRgb = this.isEffectMode
        ? clampedRgb
        : vec3(
            pow(float(clampedRgb.x), float(2.2)),
            pow(float(clampedRgb.y), float(2.2)),
            pow(float(clampedRgb.z), float(2.2))
          )

      if (outputNode.nodeType === "vec4") {
        return vec4(finalRgb, outputAlpha)
      }

      return vec4(finalRgb, float(1))
    } catch (error) {
      useLayerStore
        .getState()
        .setLayerRuntimeError(
          this.layerId,
          error instanceof Error
            ? error.message
            : "Custom shader execution failed."
        )
      return vec4(vec3(float(0), float(0), float(0)), float(1))
    }
  }
}
