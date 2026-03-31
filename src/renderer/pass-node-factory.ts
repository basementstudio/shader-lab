import { AsciiPass } from "@/renderer/ascii-pass"
import { ChromaticAberrationPass } from "@/renderer/chromatic-aberration-pass"
import { CrtPass } from "@/renderer/crt-pass"
import { DisplacementMapPass } from "@/renderer/displacement-map-pass"
import { DitheringPass } from "@/renderer/dithering-pass"
import { EdgeDetectPass } from "@/renderer/edge-detect-pass"
import { HalftonePass } from "@/renderer/halftone-pass"
import { InkPass } from "@/renderer/ink-pass"
import { ParticleGridPass } from "@/renderer/particle-grid-pass"
import { PassNode } from "@/renderer/pass-node"
import { PatternPass } from "@/renderer/pattern-pass"
import { PixelSortingPass } from "@/renderer/pixel-sorting-pass"
import { PixelationPass } from "@/renderer/pixelation-pass"
import type { EffectLayerType } from "@/types/editor"

export function createPassNode(
  layerId: string,
  type: EffectLayerType
): PassNode {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "crt":
      return new CrtPass(layerId)
    case "chromatic-aberration":
      return new ChromaticAberrationPass(layerId)
    case "displacement-map":
      return new DisplacementMapPass(layerId)
    case "dithering":
      return new DitheringPass(layerId)
    case "edge-detect":
      return new EdgeDetectPass(layerId)
    case "halftone":
      return new HalftonePass(layerId)
    case "ink":
      return new InkPass(layerId)
    case "pattern":
      return new PatternPass(layerId)
    case "particle-grid":
      return new ParticleGridPass(layerId)
    case "pixelation":
      return new PixelationPass(layerId)
    case "pixel-sorting":
      return new PixelSortingPass(layerId)
    default:
      return new PassNode(layerId)
  }
}
