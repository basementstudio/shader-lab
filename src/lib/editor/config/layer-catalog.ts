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
  group: { label: "Group" },
  "photographic-cells": {
    category: "distort",
    label: "Photographic Cells",
    description:
      "Reveal connected photographic regions with stepped edges and perimeter outlines. Group with a photo to keep the cutout isolated.",
    previewSrc: "/examples/photographic-cells.webp",
  },
  "displaced-rings": {
    category: "distort",
    label: "Displaced Rings",
    description:
      "Fragment the image into offset rings or half-discs. Use Cutout inside a group to reveal layers beneath it.",
    previewSrc: "/examples/displaced-rings.webp",
  },
  ascii: {
    category: "core",
    description:
      "Turns the image into text glyphs for a classic terminal look.",
    label: "ASCII",
    previewSrc: "/examples/ascii.webp",
  },
  annotations: {
    category: "core",
    description:
      "Decorative technical marks: target rings, dashed circles and boxes, crosshairs, rulers, connectors, readouts and metadata blocks. Placed by seed, along edges or inside your brush strokes. Nothing is recognized.",
    label: "Annotations",
    previewSrc: "/examples/annotations.webp",
  },
  "blob-tracking": {
    category: "distort",
    description:
      "Tracks moving regions and frames them with CCTV-style shapes, corner brackets, edge dots, labels, and an inner effect. Labels are decorative, not recognition.",
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
  shape: {
    label: "Shape",
    description:
      "A flat color silhouette: ellipse, rectangle, triangle, polygon, star, ring or blades. Blend it over photography or mask it.",
  },
  "connected-dots": {
    category: "core",
    description:
      "The image becomes points linked to their neighbors: tone-colored graphs, ink blobs that melt together in the darks, or plexus lines that fade with distance. Points can drift so links form and break over time.",
    label: "Connected Dots",
    previewSrc: "/examples/connected-dots.webp",
  },
  "dot-grid": {
    category: "core",
    description:
      "An exact dot grid fixed to the artboard: every cell gets a dot that grows with the tone, shapes fade out into small dots at their edges, and a blurred copy can sit underneath. Not a print simulation; use Halftone for that.",
    label: "Dot Grid",
    previewSrc: "/examples/dot-grid.webp",
  },
  relief: {
    category: "core",
    description:
      "Emboss or deboss the image into a lit surface: silver plate, letterpress, blind emboss or gold foil, with optional engraved lines and grain. Height can come from tones, a depth map or a cutout's shape.",
    label: "Relief",
    previewSrc: "/examples/relief.webp",
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
      "A pen plotter drawing of the image: hatching and crosshatch, flow lines along the forms, contour lines, squiggles, a single spiral or stipple dots, with pen width, pressure, wobble, ink bleed, up to three pens and paper.",
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
  "signal-rot": {
    category: "distort",
    description:
      "Scanner drag and decaying signal: held streaks, snaking wobble, torn bands with paper dropouts, chroma drift, crushed levels and line noise. Start from a style, then tune.",
    label: "Signal Rot",
    previewSrc: "/examples/signal-rot.webp",
  },
  erosion: {
    category: "distort",
    description:
      "Crumbles the image into speckle along its edges, light or dark tones, or the border of a cutout, throwing fragments outward. Reveal paper or cut transparent holes. Start from a style, then tune.",
    label: "Erosion",
    previewSrc: "/examples/erosion.webp",
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
  "gradient-map": {
    category: "core",
    description:
      "Recolors the image by tone with an editable ramp. Unlike the Gradient layer, it maps existing colors instead of painting a field. Scope it with groups and masks.",
    label: "Gradient Map",
    previewSrc: "/examples/gradient-map.webp",
  },
  "lumen-print": {
    category: "core",
    description:
      "Analog photographic print: sun-print toning, solarized tones with edge lines, halation, highlights washed into paper, burned borders and grain. Start from a style, then tune.",
    label: "Lumen Print",
    previewSrc: "/examples/lumen-print.webp",
  },
  "focus-blur": {
    category: "core",
    description:
      "High-quality blur that can change across the image: real depth of field from a depth map, tilt-shift bands, radial focus or tone-driven, as smooth Gaussian, lens bokeh or motion streaks, with grain. Large radii stay smooth.",
    label: "Blur",
    previewSrc: "/examples/focus-blur.webp",
  },
  glass: {
    category: "distort",
    description:
      "Textured glass in front of the image: reeded flutes, hammered, pyramid or hex cells and frost. Every cell is a small lens, the scene blurs with its distance behind the glass, and edges catch the light.",
    label: "Glass",
    previewSrc: "/examples/glass.webp",
  },
  flares: {
    category: "core",
    description:
      "Light flares from the brightest small points in the image: crosses, stars, starbursts or long anamorphic streaks, with a hot core and colored rays. Large bright areas stay clean.",
    label: "Flares",
    previewSrc: "/examples/flares.webp",
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
