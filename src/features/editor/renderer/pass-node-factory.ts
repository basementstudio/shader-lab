import { AsciiPass } from "@/features/editor/renderer/ascii-pass"
import { CrtPass } from "@/features/editor/renderer/crt-pass"
import { DitheringPass } from "@/features/editor/renderer/dithering-pass"
import { ParticleGridPass } from "@/features/editor/renderer/particle-grid-pass"
import { PassNode } from "@/features/editor/renderer/pass-node"
import { PixelSortingPass } from "@/features/editor/renderer/pixel-sorting-pass"
import type { EffectLayerType } from "@/features/editor/types"

export function createPassNode(layerId: string, type: EffectLayerType): PassNode {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "crt":
      return new CrtPass(layerId)
    case "dithering":
      return new DitheringPass(layerId)
    case "particle-grid":
      return new ParticleGridPass(layerId)
    case "pixel-sorting":
      return new PixelSortingPass(layerId)
    default:
      return new PassNode(layerId)
  }
}
