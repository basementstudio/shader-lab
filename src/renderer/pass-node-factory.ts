import { AsciiPass } from "@/renderer/ascii-pass"
import { ChromaticAberrationPass } from "@/renderer/chromatic-aberration-pass"
import { CrtPass } from "@/renderer/crt-pass"
import { DirectionalBlurPass } from "@/renderer/directional-blur-pass"
import { DisplacementMapPass } from "@/renderer/displacement-map-pass"
import { DitheringPass } from "@/renderer/dithering-pass"
import { EdgeDetectPass } from "@/renderer/edge-detect-pass"
import { FlutedGlassPass } from "@/renderer/fluted-glass-pass"
import { HalftonePass } from "@/renderer/halftone-pass"
import { InkPass } from "@/renderer/ink-pass"
import { ParticleGridPass } from "@/renderer/particle-grid-pass"
import { PassNode } from "@/renderer/pass-node"
import { PatternPass } from "@/renderer/pattern-pass"
import { PixelSortingPass } from "@/renderer/pixel-sorting-pass"
import { PixelationPass } from "@/renderer/pixelation-pass"
import { PlotterPass } from "@/renderer/plotter-pass"
import { PosterizePass } from "@/renderer/posterize-pass"
import { SlicePass } from "@/renderer/slice-pass"
import { SmearPass } from "@/renderer/smear-pass"
import { ThresholdPass } from "@/renderer/threshold-pass"
import type { EffectLayerType } from "@/types/editor"

export function createPassNode(
  layerId: string,
  type: EffectLayerType
): PassNode {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "directional-blur":
      return new DirectionalBlurPass(layerId)
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
    case "fluted-glass":
      return new FlutedGlassPass(layerId)
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
    case "plotter":
      return new PlotterPass(layerId)
    case "posterize":
      return new PosterizePass(layerId)
    case "threshold":
      return new ThresholdPass(layerId)
    case "pixel-sorting":
      return new PixelSortingPass(layerId)
    case "slice":
      return new SlicePass(layerId)
    case "smear":
      return new SmearPass(layerId)
    default:
      return new PassNode(layerId)
  }
}
