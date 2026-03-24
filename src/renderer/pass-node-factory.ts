import { AsciiPass } from "@/renderer/ascii-pass"
import { CrtPass } from "@/renderer/crt-pass"
import { DitheringPass } from "@/renderer/dithering-pass"
import { HalftonePass } from "@/renderer/halftone-pass"
import { ParticleGridPass } from "@/renderer/particle-grid-pass"
import { PassNode } from "@/renderer/pass-node"
import { PixelSortingPass } from "@/renderer/pixel-sorting-pass"
import type { EffectLayerType } from "@/types/editor"

export function createPassNode(layerId: string, type: EffectLayerType): PassNode {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "crt":
      return new CrtPass(layerId)
    case "dithering":
      return new DitheringPass(layerId)
    case "halftone":
      return new HalftonePass(layerId)
    case "particle-grid":
      return new ParticleGridPass(layerId)
    case "pixel-sorting":
      return new PixelSortingPass(layerId)
    default:
      return new PassNode(layerId)
  }
}
