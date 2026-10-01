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
    description:
      "Reveals the photo through a grid of cells joined into regions, with stepped edges and outlines.",
    category: "distort",
    label: "Photographic Cells",
    previewSrc: "/examples/effects/photographic-cells.webp",
  },
  "displaced-rings": {
    description:
      "Cuts the image into concentric rings or half-discs and shifts each one.",
    category: "distort",
    label: "Displaced Rings",
    previewSrc: "/examples/effects/displaced-rings.webp",
  },
  ascii: {
    description:
      "Redraws the image as text characters, like an old terminal.",
    category: "core",
    label: "ASCII",
    previewSrc: "/examples/effects/ascii.webp",
  },
  annotations: {
    description:
      "Technical overlay marks: target rings, crosshairs, boxes, rulers, connectors and readouts, placed along edges, at random or where you paint. Purely decorative.",
    category: "core",
    label: "Annotations",
    previewSrc: "/examples/effects/annotations.webp",
  },
  "blob-tracking": {
    description:
      "Finds moving regions and frames them with CCTV-style boxes, brackets and labels. Labels are decorative, not real recognition.",
    category: "distort",
    label: "Blob Tracking",
    previewSrc: "/examples/effects/blob-tracking.webp",
  },
  bloom: {
    description:
      "Makes bright areas glow and bleed into their surroundings.",
    category: "core",
    label: "Bloom",
    previewSrc: "/examples/effects/bloom.webp",
  },
  blur: {
    description:
      "A plain, even blur over the whole frame.",
    label: "Basic Blur",
  },
  "chromatic-aberration": {
    description:
      "Splits the color channels apart for lens fringing.",
    category: "distort",
    label: "Chromatic Aberration",
    previewSrc: "/examples/effects/chromatic-aberration.webp",
  },
  "circuit-bent": {
    description:
      "Turns the image into scanlines and bends them around a point that pulls or pushes.",
    category: "distort",
    label: "Circuit Bent",
    previewSrc: "/examples/effects/circuit-bent.webp",
  },
  crt: {
    description:
      "An old CRT screen: scanlines, phosphor glow and signal noise.",
    category: "core",
    label: "CRT",
    previewSrc: "/examples/effects/crt.webp",
  },
  "custom-shader": {
    label: "Custom Shader",
  },
  "directional-blur": {
    description:
      "Smears the image in one direction or out from a center, for motion and speed.",
    category: "distort",
    label: "Directional Blur",
  },
  "displacement-map": {
    description:
      "Warps the image by pushing pixels according to brightness.",
    category: "distort",
    label: "Displacement Map",
    previewSrc: "/examples/effects/displacement-map.webp",
  },
  dithering: {
    description:
      "Reduces the image to a few colors with ordered or textured dithering patterns.",
    category: "core",
    label: "Dithering",
    previewSrc: "/examples/effects/dithering.webp",
  },
  "edge-detect": {
    description:
      "Finds edges in the image and draws them as outlines.",
    category: "distort",
    label: "Edge Detect",
    previewSrc: "/examples/effects/edge-detect.webp",
  },
  fluid: {
    label: "Fluid",
  },
  "fluted-glass": {
    description:
      "Ribbed glass that slices the image into vertical strips with a slight color split.",
    category: "distort",
    label: "Fluted Glass",
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
    description:
      "Turns the image into points linked to their neighbors: tone graphs, ink blobs or fading plexus lines. Points can drift so links form and break.",
    category: "core",
    label: "Connected Dots",
    previewSrc: "/examples/effects/connected-dots.webp",
  },
  "dot-grid": {
    description:
      "A precise grid of dots locked to the artboard, each sized by the tone beneath it.",
    category: "core",
    label: "Dot Grid",
    previewSrc: "/examples/effects/dot-grid.webp",
  },
  relief: {
    description:
      "Embosses or debosses the image into a lit surface: silver plate, letterpress, blind emboss or gold foil.",
    category: "core",
    label: "Relief",
    previewSrc: "/examples/effects/relief.webp",
  },
  halftone: {
    description:
      "Turns the image into printed dot screens.",
    category: "core",
    label: "Halftone",
    previewSrc: "/examples/effects/halftone.webp",
  },
  image: {
    label: "Image",
  },
  ink: {
    description:
      "Smeared glow and fluid bleed for neon, ink-like edges.",
    category: "core",
    label: "Ink",
    previewSrc: "/examples/effects/ink.webp",
  },
  live: {
    label: "Camera",
  },
  "magnify-lens": {
    label: "Magnify Lens",
  },
  model: {
    label: "3D Model",
    description:
      "A .glb model, with its animation clips, or an .svg logo extruded into a solid. Framed and lit automatically with HDR studios, its own PBR materials or chrome, brushed metal, glass, clay, rubber and iridescent replacements, soft shadows and a contact-shadow floor. Its exact depth drives Blur, Glass, Relief and depth masks.",
  },
  "particle-grid": {
    description:
      "Breaks the image into a grid of glowing particles.",
    category: "core",
    label: "Particle Grid",
    previewSrc: "/examples/effects/particle-grid.webp",
  },
  pattern: {
    description:
      "Rebuilds the image from repeating graphic patterns, light to dark.",
    category: "core",
    label: "Pattern",
    previewSrc: "/examples/effects/pattern.webp",
  },
  "pixel-sorting": {
    description:
      "Sorts pixels into streaks by brightness or color.",
    category: "distort",
    label: "Pixel Sorting",
    previewSrc: "/examples/effects/pixel-sorting.webp",
  },
  "pixel-trail": {
    label: "Pixel Trail",
  },
  pixelation: {
    description:
      "Turns the image into large square pixels.",
    category: "core",
    label: "Pixelation",
    previewSrc: "/examples/effects/pixelation.webp",
  },
  outline: {
    description:
      "Draws outlines around text, cutouts or the shapes in the image: solid, double, dashed or scalloped, repeated as rings.",
    category: "core",
    label: "Outline",
    previewSrc: "/examples/effects/outline.webp",
  },
  photocopy: {
    description:
      "A worn photocopy: crushed toner, speckle, streaks, misregistration and folds. Copies of copies degrade further.",
    category: "core",
    label: "Photocopy",
    previewSrc: "/examples/effects/photocopy.webp",
  },
  plotter: {
    description:
      "Redraws the image as a pen plotter would: hatching, flow lines, contours, squiggles, a spiral or stipple.",
    category: "core",
    label: "Plotter",
    previewSrc: "/examples/effects/plotter.webp",
  },
  posterize: {
    description:
      "Flattens the image into a few bands of color.",
    category: "core",
    label: "Posterize",
    previewSrc: "/examples/effects/posterize.webp",
  },
  slice: {
    description:
      "Shifts horizontal slices of the image sideways into glitchy bands.",
    category: "distort",
    label: "Slice",
    previewSrc: "/examples/effects/slice.webp",
  },
  "signal-rot": {
    description:
      "A failing scan: dragged streaks, wobble, torn bands, color drift and line noise.",
    category: "distort",
    label: "Signal Rot",
    previewSrc: "/examples/effects/signal-rot.webp",
  },
  erosion: {
    description:
      "Crumbles the image into speckle along edges, tones or a cutout's border, throwing fragments outward.",
    category: "distort",
    label: "Erosion",
    previewSrc: "/examples/effects/erosion.webp",
  },
  smear: {
    description:
      "Blur that ramps from sharp to soft across the frame.",
    category: "distort",
    label: "Progressive Blur",
  },
  text: {
    label: "Text",
  },
  threshold: {
    description:
      "Turns the image into stark black and white at a cutoff you set.",
    category: "core",
    label: "Threshold",
    previewSrc: "/examples/effects/threshold.webp",
  },
  "gradient-map": {
    description:
      "Recolors the image by brightness using a color ramp you edit.",
    category: "core",
    label: "Gradient Map",
    previewSrc: "/examples/effects/gradient-map.webp",
  },
  "lumen-print": {
    description:
      "An analog sun print: toned shadows, solarized highlights, halation, burned edges and grain.",
    category: "core",
    label: "Lumen Print",
    previewSrc: "/examples/effects/lumen-print.webp",
  },
  grain: {
    description:
      "Film grain for photos and video, from fine 35mm to pushed 16mm. It can change every frame, like real film.",
    category: "core",
    label: "Grain",
    previewSrc: "/examples/effects/grain.webp",
  },
  "focus-blur": {
    description:
      "Blur that varies across the frame: depth of field, tilt-shift, radial focus or tone-based, with Gaussian, lens bokeh or motion streaks.",
    category: "core",
    label: "Blur",
    previewSrc: "/examples/effects/focus-blur.webp",
  },
  glass: {
    description:
      "Textured glass in front of the image: reeded, hammered, pyramid, hex or frosted. Every cell acts as a small lens.",
    category: "distort",
    label: "Glass",
    previewSrc: "/examples/effects/glass.webp",
  },
  flares: {
    description:
      "Light flares on the brightest points: crosses, stars, starbursts or anamorphic streaks.",
    category: "core",
    label: "Flares",
    previewSrc: "/examples/effects/flares.webp",
  },
  video: {
    label: "Video",
  },
  voxel: {
    description:
      "Rebuilds the image from isometric cubes, with brighter areas rising higher.",
    category: "core",
    label: "Voxel",
    previewSrc: "/examples/effects/voxel.webp",
  },
}

export function getLayerCatalogEntry(type: LayerType): LayerCatalogEntry {
  return LAYER_CATALOG[type]
}

export function getLayerLabel(type: LayerType): string {
  return LAYER_CATALOG[type]?.label ?? type
}
