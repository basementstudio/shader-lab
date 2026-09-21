import { AnnotationsPass as RuntimeAnnotations } from "@runtime/renderer/annotations-pass"
import * as THREE from "three/webgpu"
import {
  ANNOTATION_KIND,
  ANNOTATION_PRESETS,
  layoutAnnotations,
  parseAnnotationColors,
  parseAnnotationConfig,
  strongestEdgePoint,
  targetPoint,
} from "@/renderer/annotations-layout"
import { AnnotationsPass } from "@/renderer/annotations-pass"
import { emptyCellPaintMask, encodeCellPaintMask } from "@/renderer/cell-paint-mask"
import { paintCellSegment } from "@/lib/editor/paint/cell-paint-brush"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { getLayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import { canPaintAnnotationsLayer } from "@/store/cell-paint-store"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const base = () => createLayer("annotations").params

function layoutChecks() {
  let samples = 0
  const aspect = 16 / 9
  const config = parseAnnotationConfig({ ...base(), drift: 0, seed: 11 })
  const a = layoutAnnotations(config, { aspect, time: 0 })
  const b = layoutAnnotations(config, { aspect, time: 0 })
  assert(JSON.stringify(a) === JSON.stringify(b), "Layout is deterministic")
  const other = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, seed: 12 }), { aspect, time: 0 })
  assert(JSON.stringify(a.elements) !== JSON.stringify(other.elements), "Seed changes the layout")
  assert(a.elements.length > 20 && a.glyphs.length > 20, `Default layout has marks and text (${a.elements.length}, ${a.glyphs.length})`)
  const sparse = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, density: 0 }), { aspect, time: 0 })
  const dense = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, density: 1 }), { aspect, time: 0 })
  assert(sparse.elements.length < a.elements.length && a.elements.length < dense.elements.length, "Density scales element count")
  const drifted = layoutAnnotations(config, { aspect, time: 3 })
  assert(JSON.stringify(drifted.glyphs) !== JSON.stringify(a.glyphs), "Readouts change with time")
  const moving = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 1, seed: 11 }), { aspect, time: 3 })
  const still = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 1, seed: 11 }), { aspect, time: 0 })
  const lastDot = (layout) => layout.elements.filter((e) => e.kind === ANNOTATION_KIND.dot).at(-1)
  const dotA = lastDot(still)
  const dotB = lastDot(moving)
  assert(dotA && dotB && (dotA.x !== dotB.x || dotA.y !== dotB.y), "Drift moves scattered elements over time")
  samples += 6

  const [tx, ty] = targetPoint(config, aspect)
  const rings = a.elements.filter((e) => (e.kind === ANNOTATION_KIND.ring || e.kind === ANNOTATION_KIND.dashedRing) && Math.hypot(e.x - tx, e.y - ty) < 0.3)
  assert(rings.length >= 4 && rings.some((e) => e.kind === ANNOTATION_KIND.dashedRing), "Target has solid and dashed rings")
  const noTarget = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, targetEnabled: false }), { aspect, time: 0 })
  assert(noTarget.elements.every((e) => e.kind !== ANNOTATION_KIND.crosshair || Math.hypot(e.x - tx, e.y - ty) > 0.05), "Target off removes the reticle")
  const bare = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, targetEnabled: false, dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false, rulers: false, metadata: false }), { aspect, time: 0 })
  assert(bare.elements.length === 0 && bare.glyphs.length === 0, "Everything off draws nothing")
  samples += 3

  const mask = emptyCellPaintMask(aspect, 1)
  paintCellSegment(mask, { x: 0.3, y: -0.3 }, { x: 0.6, y: -0.3 }, 0.12, false)
  const painted = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "painted", paintMask: encodeCellPaintMask(mask), rulers: false, metadata: false, targetEnabled: false }), { aspect, time: 0 })
  assert(painted.elements.length > 5, `Painted placement finds strokes (${painted.elements.length})`)
  for (const element of painted.elements) {
    const u = (element.x - aspect / 2) / 1
    const v = element.y - 0.5
    assert(u > 0.1 && u < 0.8 && v > -0.5 && v < -0.1, `Painted element stays inside the stroke (${u.toFixed(2)}, ${v.toFixed(2)})`)
  }
  const emptyPaint = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "painted", paintMask: "", rulers: false, metadata: false, targetEnabled: false }), { aspect, time: 0 })
  assert(emptyPaint.elements.length === 0, "Empty paint scatters nothing")
  samples += 2

  const edges = { width: 16, height: 9, data: new Float32Array(16 * 9) }
  for (let y = 0; y < 9; y++) for (let x = 8; x < 16; x++) edges.data[y * 16 + x] = x === 12 && y === 4 ? 1 : 0.6
  const guided = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "edges", rulers: false, metadata: false, targetEnabled: false }), { aspect, time: 0, edges })
  const right = guided.elements.filter((e) => e.x > aspect / 2).length
  assert(guided.elements.length > 5 && right / guided.elements.length > 0.85, `Edge placement favors edges (${right}/${guided.elements.length})`)
  const strongest = strongestEdgePoint(edges, aspect)
  assert(Math.abs(strongest[0] - (12.5 / 16) * aspect) < 1e-6 && Math.abs(strongest[1] - 4.5 / 9) < 1e-6, "Strongest edge cell")
  const snapped = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "edges", targetSnap: true }), { aspect, time: 0, edges })
  const reticle = snapped.elements.find((e) => e.kind === ANNOTATION_KIND.crosshair && e.hw > 0.02)
  assert(reticle && Math.abs(reticle.x - strongest[0]) < 1e-6, "Snap moves the target to the strongest edge")
  samples += 3

  const custom = parseAnnotationConfig({ ...base(), labelList: "alpha\nbeta", metadataText: "one\ntwo\n\nthree" })
  assert(custom.words.join("|") === "alpha|beta" && custom.blocks.length === 2 && custom.blocks[1][0] === "three", "Custom text parses into words and blocks")
  const preset = ANNOTATION_PRESETS.find((p) => p.id === "surveillance")
  assert(parseAnnotationConfig({ ...base(), textPreset: "surveillance", labelList: undefined }).words[0] === preset.words.split("\n")[0], "Preset words apply when the list is absent")
  assert(parseAnnotationColors("garbage", "#abcdef")[0] === "#abcdef", "Invalid palette falls back to ink")
  assert(parseAnnotationColors('[{"color":"#ff0000"},{"color":"#00ff00"}]', "#000000").length === 2, "Palette parses stops")
  assert(parseAnnotationConfig({ ...base(), colorMode: "palette", colors: '["#ff0000","#00ff00"]' }).colors.length === 2, "Palette mode exposes colors")
  assert(parseAnnotationConfig({ ...base(), colorMode: "mono", colors: '["#ff0000","#00ff00"]' }).colors.length === 1, "Mono ignores the palette")
  samples += 6
  return samples
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const W = 384
  const H = 216
  const input = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  const renders = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", AnnotationsPass],
      ["runtime", RuntimeAnnotations],
    ]) {
      const pass = new Pass(`${name}-annotations`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      pass.resize(W, H)
      pass.updateLogicalSize(W, H)
      const paint = async (params, label) => {
        pass.updateParams({ ...base(), drift: 0, color: "#ff0000", strokeWidth: 3, ...params })
        pass.render(renderer, input, target, 0, 1 / 30)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
        renders[label] ??= {}
        renders[label][name] = pixels
        samples++
        let lit = 0
        const bounds = { x0: W, y0: H, x1: -1, y1: -1 }
        for (let i = 0; i < pixels.length; i += 4) {
          if (!(pixels[i] > 0.3 && pixels[i + 1] < 0.3)) continue
          lit++
          const px = (i / 4) % W
          const py = Math.floor(i / 4 / W)
          bounds.x0 = Math.min(bounds.x0, px)
          bounds.x1 = Math.max(bounds.x1, px)
          bounds.y0 = Math.min(bounds.y0, py)
          bounds.y1 = Math.max(bounds.y1, py)
        }
        return { lit, bounds }
      }
      const full = await paint({}, "default")
      assert(full.lit > 400, `${name}: default layout draws marks (${full.lit})`)
      const none = await paint({ targetEnabled: false, dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false, rulers: false, metadata: false }, "none")
      assert(none.lit === 0, `${name}: everything off draws nothing (${none.lit})`)
      const targetOnly = await paint({ dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false, rulers: false, metadata: false, targetCenter: [0, 0], targetSize: 0.4 }, "target")
      assert(targetOnly.lit > 100, `${name}: target draws rings (${targetOnly.lit})`)
      const cx = (targetOnly.bounds.x0 + targetOnly.bounds.x1) / 2
      const cy = (targetOnly.bounds.y0 + targetOnly.bounds.y1) / 2
      assert(Math.abs(cx - W / 2) < W * 0.12 && Math.abs(cy - H / 2) < H * 0.15, `${name}: target sits at its center (${cx}, ${cy})`)
      const shifted = await paint({ dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false, rulers: false, metadata: false, targetCenter: [0.4, 0], targetSize: 0.4 }, "target shifted")
      assert((shifted.bounds.x0 + shifted.bounds.x1) / 2 > cx + W * 0.2, `${name}: target center moves right`)
      const textOnly = await paint({ targetEnabled: false, dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false, rulers: false, metadata: true, textSize: 2 }, "metadata")
      assert(textOnly.lit > 50, `${name}: metadata blocks render text (${textOnly.lit})`)
      const palette = await paint({ colorMode: "palette", colors: '["#00ff00","#00ff00"]' }, "palette")
      assert(palette.lit === 0, `${name}: palette colors replace ink (${palette.lit} red pixels)`)
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(renders)) {
      let differing = 0
      for (let i = 0; i < entry.editor.length; i += 4) {
        if (Math.abs(entry.editor[i] - entry.runtime[i]) > 0.02 || Math.abs(entry.editor[i + 1] - entry.runtime[i + 1]) > 0.02) differing++
      }
      const fraction = differing / (entry.editor.length / 4)
      assert(fraction < 0.01, `parity: ${label} differs on ${(fraction * 100).toFixed(2)}% of pixels`)
      samples++
    }
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
  }
  return samples
}

export async function checkAnnotations(renderProject) {
  assert(getLayerCatalogEntry("annotations").label === "Annotations", "Catalog entry")
  let samples = 1 + layoutChecks()
  samples += await passChecks()

  const mask = emptyCellPaintMask(1, 1)
  paintCellSegment(mask, { x: -0.2, y: 0 }, { x: 0.2, y: 0 }, 0.1, false)
  const layer = { ...createLayer("annotations"), id: "notes", params: { ...base(), placement: "painted", paintMask: encodeCellPaintMask(mask), seed: 42, labelList: "HELLO\nWORLD", colorMode: "palette" } }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [layer],
    selectedLayerId: "notes",
    composition: { width: 384, height: 216 },
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#101010" },
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const state = useLayerStore.getState()
  assert(canPaintAnnotationsLayer(state.layers, "notes", "notes"), "Painted annotations are brush-editable")
  state.updateLayerParam("notes", "placement", "random")
  assert(!canPaintAnnotationsLayer(useLayerStore.getState().layers, "notes", "notes"), "Brush only in painted placement")
  useLayerStore.getState().updateLayerParam("notes", "placement", "painted")
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile().layers[0]
  assert(reopened.type === "annotations" && reopened.params.paintMask === layer.params.paintMask && reopened.params.labelList === "HELLO\nWORLD" && reopened.params.seed === 42, "Save/reopen keeps annotations")
  const config = buildShaderExportConfig(buildLabProjectFile())
  assert(config.layers[0].type === "annotations", "Shader export type")
  samples += 4

  const first = await renderProject(saved)
  const again = await renderProject(buildLabProjectFile())
  let diff = 0
  for (let i = 0; i < first.image.data.length; i++) diff = Math.max(diff, Math.abs(first.image.data[i] - again.image.data[i]))
  assert(diff === 0, "Reopened annotation pixels")
  let lit = 0
  for (let i = 0; i < first.image.data.length; i += 4) if (first.image.data[i] > 60 || first.image.data[i + 2] > 60) lit++
  assert(lit > 200, `Rendered project shows annotations (${lit})`)
  samples += 2

  const asset = { id: "photo-asset", kind: "image", url: "/scenes/default/rings-photo.webp", fileName: "slice.webp", width: 1512, height: 908 }
  const art = {
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      { ...createLayer("annotations"), id: "preview-notes", params: { ...base(), seed: 3, scale: 1.2, color: "#f3efe4" } },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "preview-notes",
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#0a0a0c" },
  }
  const preview = await renderProject(art)
  const thumbnail = document.createElement("canvas")
  thumbnail.width = preview.image.width
  thumbnail.height = preview.image.height
  thumbnail.getContext("2d").putImageData(preview.image, 0, 0)
  samples++
  return { samples, png: first.png, previewWebp: thumbnail.toDataURL("image/webp", 0.85) }
}
