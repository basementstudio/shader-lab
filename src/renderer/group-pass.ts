import * as THREE from "three/webgpu"
import { float, texture as tslTexture, type TSLNode, uv, vec2 } from "three/tsl"
import { PassNode } from "@/renderer/pass-node"

type Node = TSLNode

export class GroupPass extends PassNode {
  private groupNode: Node | null = null

  constructor(layerId: string) {
    super(layerId, "source")

    const placeholder = new THREE.Texture()
    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    this.groupNode = tslTexture(placeholder, renderTargetUv)
    this.rebuildEffectNode()
  }

  setGroupTexture(texture: THREE.Texture): void {
    if (!this.groupNode) {
      return
    }

    this.groupNode.value = texture
  }

  override updateLayerColorAdjustments(_hue: number, _saturation: number): void {
    // Groups do not expose local hue/saturation controls in v1.
  }

  protected override buildEffectNode(): Node {
    return this.groupNode ?? this.inputNode
  }
}
