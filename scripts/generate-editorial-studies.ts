import { write } from "bun"
// Rebuild the editable studies with: bun scripts/generate-editorial-studies.ts
// Reference images are visual direction only; all assets here are existing app
// media or original linework. Stable IDs make the generated .lab diffs reviewable.
import { createLayer } from "../src/lib/editor/layers"
import {
  DEFAULT_SCENE_CONFIG,
  type LayerType,
  type LayerParameterValues,
} from "../src/types/editor"
import {
  emptyCellPaintMask,
  encodeCellPaintMask,
} from "../src/renderer/cell-paint-mask"
import { paintCellSegment } from "../src/lib/editor/paint/cell-paint-brush"

function layer(
  type: LayerType,
  id: string,
  name: string,
  params: LayerParameterValues = {},
  parentId?: string
) {
  const base = createLayer(type)
  return {
    ...base,
    id,
    name,
    ...(parentId ? { parentId } : {}),
    params: { ...base.params, ...params },
  }
}
function text(
  id: string,
  words: string,
  x: number,
  y: number,
  color = "#202020"
) {
  return layer("text", id, words, {
    text: words,
    fontFamily: "mono",
    fontWeight: 400,
    fontSize: 48,
    letterSpacing: -0.04,
    anchor: "top-left",
    offset: [x, -y],
    textColor: color,
  })
}
const base = {
  format: "shader-lab",
  version: 7,
  composition: { width: 720, height: 960 },
  selectedLayerId: "cells",
  sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#ffffff" },
  timeline: { duration: 5, loop: true, tracks: [] },
}
const group = layer("group", "study", "Color / fine dots")
const color = {
  ...base,
  assets: [
    {
      id: "registration",
      kind: "image",
      url: "/scenes/default/editorial/registration.svg",
      fileName: "registration.svg",
      mimeType: "image/svg+xml",
      width: 720,
      height: 960,
    },
  ],
  layers: [
    text("title", "FIELD", 0.55, 0.12),
    text("subtitle", "NOTES", 0.55, 0.18),
    text("edition", "01 /", 0.72, 0.89),
    {
      ...layer("image", "marks", "Registration marks", { fitMode: "contain" }),
      assetId: "registration",
      opacity: 0.35,
    },
    group,
    layer(
      "photographic-cells",
      "cells",
      "Stepped regions",
      {
        mode: "regions",
        seed: 11,
        threshold: 0.48,
        regionSize: 0.4,
        size: 0.03,
        edgeScatter: 0.65,
        outlineMode: "none",
      },
      group.id
    ),
    layer(
      "halftone",
      "dots",
      "Fine source-color dots",
      {
        colorMode: "source",
        spacing: 3,
        angle: 45,
        dotSize: 0.8,
        dotMin: 0.45,
        contrast: 1.2,
        paperGrain: 0,
        bloomEnabled: false,
      },
      group.id
    ),
    layer(
      "gradient",
      "color",
      "Blue / ochre / violet",
      {
        animate: false,
        motionAmount: 0,
        tonemapMode: "none",
        grainAmount: 0,
        glowStrength: 0,
        vignetteStrength: 0,
        activePoints: 5,
        falloff: 3.8,
        warpAmount: 0.5,
        warpScale: 2,
        vortexAmount: 0.4,
        noiseType: "simplex",
        noiseSeed: 12,
        point1Color: "#e9a019",
        point1Position: [-0.5, -0.55],
        point1Weight: 1,
        point2Color: "#397bca",
        point2Position: [0.55, -0.4],
        point2Weight: 1,
        point3Color: "#008f97",
        point3Position: [-0.5, 0.65],
        point3Weight: 1,
        point4Color: "#5534ac",
        point4Position: [0.05, 0.1],
        point4Weight: 0.7,
        point5Color: "#f4d545",
        point5Position: [0.6, 0.65],
        point5Weight: 1,
      },
      group.id
    ),
  ],
}

const mask = emptyCellPaintMask(1, 4 / 3)
// A directed, diagonal specimen cutout with a small detached fragment. These
// are ordinary editable Paint strokes, not a flattened or hidden image mask.
for (const [x0, y0, x1, y1, radius] of [
  [0.02, -0.46, 0.17, -0.25, 0.16],
  [0.17, -0.25, 0.1, 0.18, 0.18],
  [0.1, 0.18, 0.3, 0.4, 0.19],
  [-0.3, 0.13, -0.28, 0.26, 0.09],
])
  paintCellSegment(mask, { x: x0!, y: y0! }, { x: x1!, y: y1! }, radius!, false)
const photoGroup = layer("group", "study", "Painted specimen")
const photo = {
  ...base,
  assets: [
    {
      id: "annotations",
      kind: "image",
      url: "/scenes/default/editorial/specimen-lines.svg",
      fileName: "specimen-lines.svg",
      mimeType: "image/svg+xml",
      width: 720,
      height: 960,
    },
    {
      id: "flora",
      kind: "image",
      url: "/scenes/default/editorial/flora.webp",
      fileName: "flora.webp",
      mimeType: "image/webp",
      width: 1512,
      height: 909,
    },
  ],
  layers: [
    text("title", "FIELD / 02", 0.06, 0.055, "#aa3676"),
    text("subtitle", "flora", 0.06, 0.89, "#aa3676"),
    {
      ...layer("image", "marks", "Specimen linework", { fitMode: "contain" }),
      assetId: "annotations",
      opacity: 0.6,
    },
    photoGroup,
    layer(
      "photographic-cells",
      "cells",
      "Painted photographic reveal",
      {
        mode: "paint",
        paintMask: encodeCellPaintMask(mask),
        size: 0.04,
        edgeScatter: 0.25,
        outlineMode: "perimeter",
        outline: 0.035,
        outlineColor: "#b53387",
      },
      photoGroup.id
    ),
    {
      ...layer(
        "image",
        "photo",
        "Flora — replace with your photo",
        { fitMode: "cover" },
        photoGroup.id
      ),
      assetId: "flora",
    },
  ],
}
for (const [name, project] of [
  ["color-field", color],
  ["painted-flora", photo],
] as const) {
  await write(
    `public/examples/v3/${name}.lab`,
    `${JSON.stringify(project, null, 2)}\n`
  )
}
