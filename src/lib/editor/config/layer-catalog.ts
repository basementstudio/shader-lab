import type { LayerType } from "@/types/editor"

export const LAYER_CATALOG_CATEGORIES = ["core", "distort"] as const
export type LayerCatalogCategory = (typeof LAYER_CATALOG_CATEGORIES)[number]

export interface LayerCatalogEntry {
  category?: LayerCatalogCategory
  description?: string
  label: string
  previewSrc?: string
}

export const LAYER_CATALOG: Record<LayerType, LayerCatalogEntry> = {
  ascii: {
    category: "core",
    description:
      "Turns the image into text glyphs for a classic terminal look.",
    label: "ASCII",
    previewSrc: "/examples/ascii.webp",
  },
  "blob-tracking": {
    category: "distort",
    description:
      "Tracks moving regions and frames them with CCTV-style shapes, labels, and an inner effect.",
    label: "Blob Tracking",
    previewSrc: "/examples/blob-tracking.webp",
  },
  bloom: {
    category: "core",
    description:
      "Adds a standalone highlight bloom pass to the incoming frame.",
    label: "Bloom",
  },
  blur: {
    label: "Blur",
  },
  "chromatic-aberration": {
    category: "distort",
    description:
      "Offsets color channels for fringing and lens-separation effects.",
    label: "Chromatic Aberration",
    previewSrc: "/examples/chromatic-aberration.webp",
  },
  "circuit-bent": {
    category: "distort",
    description:
      "Renders luma-gated scanlines and bends them around a pull or push attractor.",
    label: "Circuit Bent",
    previewSrc: "/examples/circuit-bent.webp",
  },
  crt: {
    category: "core",
    description: "Adds scanlines, phosphor bloom, and display-era noise.",
    label: "CRT",
    previewSrc: "/examples/crt.webp",
  },
  "custom-shader": {
    label: "Custom Shader",
  },
  "directional-blur": {
    category: "distort",
    description:
      "Smears pixels linearly or radially for motion, focus, or depth.",
    label: "Directional Blur",
    previewSrc: "/examples/directional-blur.webp",
  },
  "displacement-map": {
    category: "distort",
    description:
      "Pushes pixels along luminance to create warped displacement fields.",
    label: "Displacement Map",
    previewSrc: "/examples/displacement-map.webp",
  },
  dithering: {
    category: "core",
    description: "Reduces color resolution into ordered or textured dithering.",
    label: "Dithering",
    previewSrc: "/examples/dithering.webp",
  },
  "edge-detect": {
    category: "distort",
    description:
      "Extracts contrast edges and turns them into graphic outlines.",
    label: "Edge Detect",
    previewSrc: "/examples/edge-detect.webp",
  },
  fluid: {
    label: "Fluid",
  },
  "fluted-glass": {
    category: "distort",
    description:
      "Ribbed lenticular glass distortion with subtle chromatic split.",
    label: "Fluted Glass",
    previewSrc: "/examples/fluted-glass.webp",
  },
  gradient: {
    label: "Mesh Gradient",
  },
  halftone: {
    category: "core",
    description:
      "Converts the frame into graphic dot screens and print textures.",
    label: "Halftone",
    previewSrc: "/examples/halftone.webp",
  },
  image: {
    label: "Image",
  },
  ink: {
    category: "core",
    description: "Adds smeared glow and fluid bleed for neon ink-like edges.",
    label: "Ink",
    previewSrc: "/examples/ink.webp",
  },
  live: {
    label: "Camera",
  },
  "magnify-lens": {
    label: "Magnify Lens",
  },
  model: {
    label: "3D Model",
  },
  "particle-grid": {
    category: "core",
    description: "Breaks the image into a glowing particle matrix.",
    label: "Particle Grid",
    previewSrc: "/examples/particle-grid.webp",
  },
  pattern: {
    category: "core",
    description: "Maps the source into repeatable woven and graphic textures.",
    label: "Pattern",
    previewSrc: "/examples/pattern.webp",
  },
  "pixel-sorting": {
    category: "distort",
    description:
      "Sorts neighboring pixels into streaks based on luma or color.",
    label: "Pixel Sorting",
    previewSrc: "/examples/pixel-sorting.webp",
  },
  "pixel-trail": {
    label: "Pixel Trail",
  },
  pixelation: {
    category: "core",
    description:
      "Groups neighboring pixels into larger blocks for a low-res look.",
    label: "Pixelation",
    previewSrc: "/examples/pixelation.webp",
  },
  plotter: {
    category: "core",
    description:
      "Pen-plotter aesthetic with hatching, crosshatching, and ink simulation.",
    label: "Plotter",
    previewSrc: "/examples/plotter.webp",
  },
  posterize: {
    category: "core",
    description:
      "Compresses tones into fewer steps while keeping the image graphic.",
    label: "Posterize",
    previewSrc: "/examples/posterize.webp",
  },
  slice: {
    category: "distort",
    description:
      "Offsets horizontal slices into blocky glitch bands and streaks.",
    label: "Slice",
    previewSrc: "/examples/slice.webp",
  },
  smear: {
    category: "distort",
    description:
      "Blur that ramps from sharp to soft across a controllable range.",
    label: "Progressive Blur",
    previewSrc: "/examples/progressive-blur.webp",
  },
  text: {
    label: "Text",
  },
  threshold: {
    category: "core",
    description:
      "Turns the frame into stark black and white with controllable cutoff and grain.",
    label: "Threshold",
    previewSrc: "/examples/threshold.webp",
  },
  video: {
    label: "Video",
  },
  voxel: {
    category: "core",
    description:
      "Quantizes the frame into isometric cubes; depth raises columns by luminance.",
    label: "Voxel",
    previewSrc: "/examples/voxel.webp",
  },
}

export function getLayerCatalogEntry(type: LayerType): LayerCatalogEntry {
  return LAYER_CATALOG[type]
}

export function getLayerLabel(type: LayerType): string {
  return LAYER_CATALOG[type]?.label ?? type
}
