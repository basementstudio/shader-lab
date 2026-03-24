import { clamp, float, type TSLNode, uniform, vec3, vec4 } from "three/tsl"
import { CUSTOM_SHADER_ENTRY_EXPORT } from "@/lib/editor/custom-shader/shared"
import { compileCustomShaderModule } from "@/renderer/custom-shader-runtime"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import { useLayerStore } from "@/store/layer-store"

type Node = TSLNode

export class CustomShaderPass extends PassNode {
  private compiledSketch: (() => Node) | null = null
  private compileRequestId = 0
  private lastCompileSignature = ""
  private readonly timeUniform: Node

  constructor(layerId: string) {
    super(layerId)
    this.timeUniform = uniform(0)
    this.rebuildEffectNode()
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override updateParams(params: LayerParameterValues): void {
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

    void compileCustomShaderModule({
      entryExport,
      extraScope: {
        time: this.timeUniform,
      },
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
  }

  protected override buildEffectNode(): Node {
    if (!this.compiledSketch) {
      return vec4(vec3(float(0), float(0), float(0)), float(1))
    }

    try {
      return vec4(
        clamp(
          this.compiledSketch(),
          vec3(float(0), float(0), float(0)),
          vec3(float(1), float(1), float(1))
        ),
        float(1)
      )
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
