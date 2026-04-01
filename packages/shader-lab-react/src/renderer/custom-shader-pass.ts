import { clamp, float, type TSLNode, uniform, vec3, vec4 } from "three/tsl"
import { CUSTOM_SHADER_ENTRY_EXPORT } from "../lib/editor/custom-shader/shared"
import type { LayerParameterValues } from "../types/editor"
import { compileCustomShaderModule } from "./custom-shader-runtime"
import { PassNode } from "./pass-node"

type Node = TSLNode
type TypedNode = TSLNode & { nodeType?: string | null }

export class CustomShaderPass extends PassNode {
  private readonly onRuntimeError:
    | ((message: string | null) => void)
    | undefined
  private compiledSketch: (() => Node) | null = null
  private compileRequestId = 0
  private lastCompileSignature = ""
  private readonly timeUniform: Node

  constructor(
    layerId: string,
    onRuntimeError?: (message: string | null) => void
  ) {
    super(layerId)
    this.onRuntimeError = onRuntimeError
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
        this.onRuntimeError?.(null)
        this.rebuildEffectNode()
      })
      .catch((error) => {
        if (requestId !== this.compileRequestId) {
          return
        }

        this.compiledSketch = null
        this.onRuntimeError?.(
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
      const outputNode = this.compiledSketch() as TypedNode
      const outputAlpha =
        outputNode.nodeType === "vec4"
          ? clamp(float(outputNode.a), float(0), float(1))
          : float(1)
      const clampedRgb = clamp(
        (outputNode.rgb ?? vec3(outputNode)).mul(outputAlpha),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1))
      )

      if (outputNode.nodeType === "vec4") {
        return vec4(clampedRgb, outputAlpha)
      }

      return vec4(clampedRgb, float(1))
    } catch (error) {
      this.onRuntimeError?.(
        error instanceof Error
          ? error.message
          : "Custom shader execution failed."
      )
      return vec4(vec3(float(0), float(0), float(0)), float(1))
    }
  }
}
