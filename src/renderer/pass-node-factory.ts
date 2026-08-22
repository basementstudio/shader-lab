import type * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { EditorLayer } from "@/types/editor"

/* Every pass module is its own chunk, loaded when a layer of its type first
 * appears. The pipeline tolerates a not-yet-loaded factory the same way it
 * tolerates a not-yet-compiled material: the layer joins the frame once the
 * module (then the compile) resolves. */

export type PassFactory = (
  layerId: string,
  renderer: THREE.WebGPURenderer
) => PassNode

const EFFECT_FALLBACK_KEY = "effect:fallback"

const PASS_LOADERS: Record<string, () => Promise<PassFactory>> = {
  [EFFECT_FALLBACK_KEY]: () => Promise.resolve((id) => new PassNode(id)),
  "effect:ascii": async () => {
    const m = await import("@/renderer/ascii-pass")
    return (id) => new m.AsciiPass(id)
  },
  "effect:blob-tracking": async () => {
    const m = await import("@/renderer/blob-tracking-pass")
    return (id) => new m.BlobTrackingPass(id)
  },
  "effect:bloom": async () => {
    const m = await import("@/renderer/bloom-pass")
    return (id) => new m.BloomPass(id)
  },
  "effect:chromatic-aberration": async () => {
    const m = await import("@/renderer/chromatic-aberration-pass")
    return (id) => new m.ChromaticAberrationPass(id)
  },
  "effect:circuit-bent": async () => {
    const m = await import("@/renderer/circuit-bent-pass")
    return (id) => new m.CircuitBentPass(id)
  },
  "effect:crt": async () => {
    const m = await import("@/renderer/crt-pass")
    return (id) => new m.CrtPass(id)
  },
  "effect:directional-blur": async () => {
    const m = await import("@/renderer/directional-blur-pass")
    return (id) => new m.DirectionalBlurPass(id)
  },
  "effect:displacement-map": async () => {
    const m = await import("@/renderer/displacement-map-pass")
    return (id) => new m.DisplacementMapPass(id)
  },
  "effect:dithering": async () => {
    const m = await import("@/renderer/dithering-pass")
    return (id) => new m.DitheringPass(id)
  },
  "effect:edge-detect": async () => {
    const m = await import("@/renderer/edge-detect-pass")
    return (id) => new m.EdgeDetectPass(id)
  },
  "effect:fluted-glass": async () => {
    const m = await import("@/renderer/fluted-glass-pass")
    return (id) => new m.FlutedGlassPass(id)
  },
  "effect:halftone": async () => {
    const m = await import("@/renderer/halftone-pass")
    return (id) => new m.HalftonePass(id)
  },
  "effect:ink": async () => {
    const m = await import("@/renderer/ink-pass")
    return (id) => new m.InkPass(id)
  },
  "effect:particle-grid": async () => {
    const m = await import("@/renderer/particle-grid-pass")
    return (id) => new m.ParticleGridPass(id)
  },
  "effect:pattern": async () => {
    const m = await import("@/renderer/pattern-pass")
    return (id) => new m.PatternPass(id)
  },
  "effect:pixel-sorting": async () => {
    const m = await import("@/renderer/pixel-sorting-pass")
    return (id) => new m.PixelSortingPass(id)
  },
  "effect:pixelation": async () => {
    const m = await import("@/renderer/pixelation-pass")
    return (id) => new m.PixelationPass(id)
  },
  "effect:plotter": async () => {
    const m = await import("@/renderer/plotter-pass")
    return (id) => new m.PlotterPass(id)
  },
  "effect:posterize": async () => {
    const m = await import("@/renderer/posterize-pass")
    return (id) => new m.PosterizePass(id)
  },
  "effect:slice": async () => {
    const m = await import("@/renderer/slice-pass")
    return (id) => new m.SlicePass(id)
  },
  "effect:smear": async () => {
    const m = await import("@/renderer/smear-pass")
    return (id) => new m.SmearPass(id)
  },
  "effect:threshold": async () => {
    const m = await import("@/renderer/threshold-pass")
    return (id) => new m.ThresholdPass(id)
  },
  "effect:voxel": async () => {
    const m = await import("@/renderer/voxel-pass")
    return (id) => new m.VoxelPass(id)
  },
  "source:custom-shader": async () => {
    const m = await import("@/renderer/custom-shader-pass")
    return (id) => new m.CustomShaderPass(id)
  },
  "source:fluid": async () => {
    const m = await import("@/renderer/fluid-pass")
    return (id, renderer) => new m.FluidPass(id, renderer)
  },
  "source:gradient": async () => {
    const m = await import("@/renderer/gradient-pass")
    return (id) => new m.GradientPass(id)
  },
  "source:live": async () => {
    const m = await import("@/renderer/live-pass")
    return (id) => new m.LivePass(id)
  },
  "source:magnify-lens": async () => {
    const m = await import("@/renderer/magnify-lens-pass")
    return (id, renderer) => new m.MagnifyLensPass(id, renderer)
  },
  "source:media": async () => {
    const m = await import("@/renderer/media-pass")
    return (id) => new m.MediaPass(id)
  },
  "source:pixel-trail": async () => {
    const m = await import("@/renderer/pixel-trail-pass")
    return (id, renderer) => new m.PixelTrailPass(id, renderer)
  },
  "source:text": async () => {
    const m = await import("@/renderer/text-pass")
    return (id) => new m.TextPass(id)
  },
}

export function passKeyForLayer(
  layer: Pick<EditorLayer, "kind" | "type">
): string | null {
  if (layer.kind === "effect") {
    const key = `effect:${layer.type}`

    return key in PASS_LOADERS ? key : EFFECT_FALLBACK_KEY
  }

  if (layer.kind === "source") {
    if (layer.type === "image" || layer.type === "video") {
      return "source:media"
    }

    const key = `source:${layer.type}`

    return key in PASS_LOADERS ? key : null
  }

  return null
}

const loadedFactories = new Map<string, PassFactory>()
const inFlightLoads = new Map<string, Promise<PassFactory>>()

export function getLoadedPassFactory(key: string): PassFactory | null {
  return loadedFactories.get(key) ?? null
}

export function loadPassFactory(key: string): Promise<PassFactory> {
  const loaded = loadedFactories.get(key)

  if (loaded) {
    return Promise.resolve(loaded)
  }

  const inFlight = inFlightLoads.get(key)

  if (inFlight) {
    return inFlight
  }

  const loader = PASS_LOADERS[key]

  if (!loader) {
    return Promise.reject(
      new Error(`Unsupported layer type in current scope: ${key}`)
    )
  }

  const load = loader()
    .then((factory) => {
      loadedFactories.set(key, factory)

      return factory
    })
    .finally(() => {
      // A failed load must retry on the next request, not cache the rejection.
      inFlightLoads.delete(key)
    })

  inFlightLoads.set(key, load)

  return load
}

export async function preloadPassFactories(
  layers: readonly Pick<EditorLayer, "kind" | "type">[]
): Promise<void> {
  const keys = new Set<string>()

  for (const layer of layers) {
    const key = passKeyForLayer(layer)

    if (key !== null) {
      keys.add(key)
    }
  }

  // Rejects on a failed chunk so strict callers (exports) can abort;
  // best-effort callers catch at the call site.
  await Promise.all([...keys].map((key) => loadPassFactory(key)))
}
