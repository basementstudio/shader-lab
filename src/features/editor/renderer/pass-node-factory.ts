import { AsciiPass } from "@/features/editor/renderer/ascii-pass"
import { DitheringPass } from "@/features/editor/renderer/dithering-pass"
import { ParticleGridPass } from "@/features/editor/renderer/particle-grid-pass"
import { PassNode } from "@/features/editor/renderer/pass-node"
import type { EffectLayerType } from "@/features/editor/types"

export function createPassNode(layerId: string, type: EffectLayerType): PassNode {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "dithering":
      return new DitheringPass(layerId)
    case "particle-grid":
      return new ParticleGridPass(layerId)
    default:
      return new PassNode(layerId)
  }
}
