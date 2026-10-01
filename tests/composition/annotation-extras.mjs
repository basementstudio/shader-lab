import { AnnotationsPass as RuntimeAnnotations } from "@runtime/renderer/annotations-pass"
import { segmentAnnotationRegions as runtimeSegment } from "@runtime/renderer/annotations-regions"
import * as THREE from "three/webgpu"
import {
  ANNOTATION_KIND,
  layoutAnnotations,
  MAX_ANNOTATION_ELEMENTS,
  parseAnnotationConfig,
} from "@/renderer/annotations-layout"
import { AnnotationsPass } from "@/renderer/annotations-pass"
import { segmentAnnotationRegions } from "@/renderer/annotations-regions"
import { emptyCellPaintMask, encodeCellPaintMask } from "@/renderer/cell-paint-mask"
import { buildRendererFrame } from "@/renderer/contracts"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { paintCellSegment } from "@/lib/editor/paint/cell-paint-brush"
import { createLayer } from "@/lib/editor/layers"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  buildViewerProjectState,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { isParamVisible } from "@/components/editor/properties-sidebar-utils"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import {
  digestLayouts,
  LEGACY_LAYOUT_DIGEST,
  legacyEdgeField,
  legacyParams,
} from "./annotation-extras-cases.mjs"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const base = () => createLayer("annotations").params
const ASPECT = 16 / 9
const FIELD_W = 128
const FIELD_H = 72
const PHOTO = { id: "photo-asset", kind: "image", url: "/scenes/default/rings-photo.webp", fileName: "slice.webp", width: 1512, height: 908 }

function syntheticColor(shift = 0) {
  const color = new Float32Array(FIELD_W * FIELD_H * 3)
  const rects = [
    [12 + shift, 10, 44 + shift, 34, [0.85, 0.5, 0.5]],
    [70, 30 + shift, 110, 62 + shift, [0.25, 0.5, 0.75]],
    [20, 44, 50, 66, [0.55, 0.9, 0.3]],
  ]
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      let value = [0.45, 0.5, 0.5]
      for (const [x0, y0, x1, y1, tone] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) value = tone
      color.set(value, (y * FIELD_W + x) * 3)
    }
  }
  return { color, rects }
}

function syntheticField(shift = 0, previous = null) {
  const { color, rects } = syntheticColor(shift)
  const regions = segmentAnnotationRegions(FIELD_W, FIELD_H, color, previous)
  const data = new Float32Array(FIELD_W * FIELD_H)
  const angle = new Float32Array(FIELD_W * FIELD_H)
  for (const region of regions.regions)
    for (let k = 0; k < region.boundary.length; k += 2) {
      const x = Math.floor(region.boundary[k] * FIELD_W)
      const y = Math.floor(region.boundary[k + 1] * FIELD_H)
      data[y * FIELD_W + x] = 1
    }
  return { regions, rects, edges: { width: FIELD_W, height: FIELD_H, data, color, angle } }
}

function segmentChecks() {
  let samples = 0
  const { regions, rects } = syntheticField()
  const again = syntheticField()
  assert(JSON.stringify(regions.regions.map((r) => ({ ...r, boundary: [...r.boundary] }))) === JSON.stringify(again.regions.regions.map((r) => ({ ...r, boundary: [...r.boundary] }))), "Segmentation is deterministic")
  const runtime = runtimeSegment(FIELD_W, FIELD_H, syntheticColor().color, null)
  assert(JSON.stringify(runtime.regions.map((r) => [r.id, r.u, r.v, r.area])) === JSON.stringify(regions.regions.map((r) => [r.id, r.u, r.v, r.area])), "Runtime segments identically")
  assert(regions.regions.length === 4, `Three shapes plus background make four regions (${regions.regions.length})`)
  for (const [x0, y0, x1, y1] of rects) {
    const match = regions.regions.find((r) => Math.abs(r.u0 - x0 / FIELD_W) < 1.5 / FIELD_W && Math.abs(r.v1 - y1 / FIELD_H) < 1.5 / FIELD_H)
    assert(match, `A region matches the rectangle ${[x0, y0, x1, y1]}`)
    assert(Math.abs(match.u - (x0 + x1) / 2 / FIELD_W) < 0.01 && Math.abs(match.v - (y0 + y1) / 2 / FIELD_H) < 0.02, "Region centroid sits in the rectangle")
    assert(Math.abs(match.area - ((x1 - x0) * (y1 - y0)) / (FIELD_W * FIELD_H)) < 0.01, "Region area matches")
    assert(match.boundary.length >= 16, "Region has boundary points")
  }
  samples += 6
  const shifted = syntheticField(2, regions)
  const byId = (field, id) => field.regions.regions.find((r) => r.id === id)
  for (const region of regions.regions) {
    const next = byId(shifted, region.id)
    assert(next, `Region ${region.id} keeps its id when the image shifts slightly`)
    assert(Math.hypot((next.u - region.u) * ASPECT, next.v - region.v) < 0.04, "Its centroid moves only a little")
  }
  assert(shifted.regions.nextId === regions.nextId, "No new ids for a small shift")
  const { color } = syntheticColor()
  for (let y = 2; y < 16; y++) for (let x = 90; x < 118; x++) color.set([0.95, 0.95, 0.2], (y * FIELD_W + x) * 3)
  const added = segmentAnnotationRegions(FIELD_W, FIELD_H, color, regions)
  assert(added.regions.length === 5 && added.regions.at(-1).id === regions.nextId, "A new shape gets a fresh id and the others keep theirs")
  assert(regions.regions.every((r) => added.regions.some((a) => a.id === r.id)), "Old ids survive a new region")
  samples += 4
  return { samples, regions: regions }
}

function layoutChecks() {
  let samples = 0
  const aspect = ASPECT
  const legacy = digestLayouts(layoutAnnotations, parseAnnotationConfig, legacyParams(base()))
  assert(legacy === LEGACY_LAYOUT_DIGEST, `Saved projects keep their exact layouts (${legacy} vs ${LEGACY_LAYOUT_DIGEST})`)
  const neutral = digestLayouts(layoutAnnotations, parseAnnotationConfig, { ...base(), rotationJitter: 0, alignToEdges: false, connectedDots: false })
  assert(neutral === LEGACY_LAYOUT_DIGEST, "New controls at neutral values keep the layout")
  const withoutField = layoutAnnotations(parseAnnotationConfig({ ...base(), placement: "regions" }), { aspect, time: 1 })
  const seeded = layoutAnnotations(parseAnnotationConfig({ ...base(), placement: "random" }), { aspect, time: 1 })
  assert(JSON.stringify(withoutField) === JSON.stringify(seeded), "Regions without an analysed image fall back to Seeded")
  samples += 3

  const quiet = { targetEnabled: false, rulers: false, metadata: false, drift: 0 }
  const plain = layoutAnnotations(parseAnnotationConfig({ ...base(), ...quiet, seed: 5 }), { aspect, time: 0 })
  const turned = layoutAnnotations(parseAnnotationConfig({ ...base(), ...quiet, seed: 5, rotationJitter: 0.8 }), { aspect, time: 0 })
  assert(plain.elements.length === turned.elements.length, "Jitter keeps the element count")
  const turnable = new Set([ANNOTATION_KIND.box, ANNOTATION_KIND.dashedBox, ANNOTATION_KIND.brackets, ANNOTATION_KIND.cross, ANNOTATION_KIND.crosshair])
  let rotated = 0
  for (const [i, element] of turned.elements.entries()) {
    const before = plain.elements[i]
    assert(element.kind === before.kind && element.x === before.x && element.y === before.y && element.hw === before.hw, "Jitter keeps positions and sizes")
    if (turnable.has(element.kind) && Math.abs(element.rotation) > 0.01) rotated++
    assert(Math.abs(element.rotation) <= 0.8 * Math.PI * 0.5 + 1e-6, "Jitter stays within its range")
  }
  assert(rotated >= 5, `Jitter turns boxes and crosses (${rotated})`)
  const fixed = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, rotationJitter: 1 }), { aspect, time: 0 })
  const ticks = fixed.elements.filter((e) => e.kind === ANNOTATION_KIND.ticks || e.kind === ANNOTATION_KIND.gradientBar)
  assert(ticks.length === 3 && ticks.every((e) => e.rotation === 0 || e.rotation === Math.PI / 2), "Rulers and metadata stay axis-aligned")
  const plainGlyphs = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, boxes: false }), { aspect, time: 0 }).glyphs
  const turnedGlyphs = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, boxes: false, rotationJitter: 1 }), { aspect, time: 0 }).glyphs
  assert(JSON.stringify(plainGlyphs) === JSON.stringify(turnedGlyphs), "Text stays upright")
  samples += 4

  const edges = legacyEdgeField()
  edges.angle = new Float32Array(edges.data.length).fill(0.6)
  const aligned = layoutAnnotations(parseAnnotationConfig({ ...base(), ...quiet, placement: "edges", alignToEdges: true }), { aspect, time: 0, edges })
  const alignedBoxes = aligned.elements.filter((e) => turnable.has(e.kind))
  assert(alignedBoxes.length >= 5 && alignedBoxes.every((e) => Math.abs(e.rotation - 0.6) < 1e-6), "Align to Edges turns boxes and crosses along the edge tangent")
  const seededAligned = layoutAnnotations(parseAnnotationConfig({ ...base(), ...quiet, placement: "random", alignToEdges: true }), { aspect, time: 0, edges })
  assert(seededAligned.elements.every((e) => e.rotation === 0 || e.kind === ANNOTATION_KIND.dashedLine), "Align needs an edge field placement")
  samples += 2

  const linkOnly = { ...base(), ...quiet, dots: false, rings: false, crosses: false, boxes: false, connectors: false, labels: false }
  const none = layoutAnnotations(parseAnnotationConfig(linkOnly), { aspect, time: 0 })
  assert(none.elements.length === 0, "Connected Dots is off by default")
  const graph = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, connectedDots: true }), { aspect, time: 0 })
  const nodes = graph.elements.filter((e) => e.kind === ANNOTATION_KIND.dot)
  const links = graph.elements.filter((e) => e.kind === ANNOTATION_KIND.line)
  assert(nodes.length >= 10 && links.length >= nodes.length - 3, `Connected Dots draws nodes and links (${nodes.length}, ${links.length})`)
  for (const link of links) {
    const ends = [-1, 1].map((sign) => [link.x + sign * Math.cos(link.rotation) * link.hw, link.y + sign * Math.sin(link.rotation) * link.hw])
    assert(ends.every(([x, y]) => nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 1e-6)), "Every link joins two dots")
    assert(link.hw * 2 < 0.25, "Links stay short (nearest neighbours)")
  }
  const others = { ...base(), drift: 0, seed: 21 }
  const withGraph = layoutAnnotations(parseAnnotationConfig({ ...others, connectedDots: true }), { aspect, time: 0 })
  const withoutGraph = layoutAnnotations(parseAnnotationConfig(others), { aspect, time: 0 })
  assert(JSON.stringify(withGraph.elements.slice(0, withoutGraph.elements.length)) === JSON.stringify(withoutGraph.elements), "Adding Connected Dots leaves the other marks where they were")
  const dense = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, connectedDots: true, density: 1 }), { aspect, time: 0 })
  const sparse = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, connectedDots: true, density: 0 }), { aspect, time: 0 })
  assert(sparse.elements.length < graph.elements.length && graph.elements.length < dense.elements.length, "Density scales the constellations")
  const full = layoutAnnotations(parseAnnotationConfig({ ...base(), density: 1, scale: 0.4, connectedDots: true }), { aspect, time: 0 })
  assert(full.elements.length <= MAX_ANNOTATION_ELEMENTS && full.elements.some((e) => e.kind === ANNOTATION_KIND.gradientBar), "The element budget still holds, with metadata kept")
  const mask = emptyCellPaintMask(aspect, 1)
  paintCellSegment(mask, { x: 0.3, y: -0.3 }, { x: 0.6, y: -0.3 }, 0.12, false)
  const painted = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, connectedDots: true, placement: "painted", paintMask: encodeCellPaintMask(mask) }), { aspect, time: 0 })
  const paintedNodes = painted.elements.filter((e) => e.kind === ANNOTATION_KIND.dot)
  assert(paintedNodes.length >= 5, "Painted constellations appear")
  for (const node of paintedNodes) {
    const u = node.x - aspect / 2
    const v = node.y - 0.5
    assert(u > 0.1 && u < 0.8 && v > -0.5 && v < -0.1, `Painted constellation nodes stay inside the stroke (${u.toFixed(2)}, ${v.toFixed(2)})`)
  }
  const edgeNodes = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, connectedDots: true, placement: "edges" }), { aspect, time: 0, edges: legacyEdgeField() }).elements.filter((e) => e.kind === ANNOTATION_KIND.dot)
  assert(edgeNodes.length >= 5 && edgeNodes.filter((n) => n.x > aspect / 2 - 0.05).length / edgeNodes.length > 0.85, "Edge constellations follow the edges")
  samples += 9

  const field = syntheticField()
  const regionContext = { aspect, time: 0, edges: field.edges, regions: field.regions }
  const regionLayout = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "regions", targetEnabled: false, rulers: false, metadata: false }), regionContext)
  assert(JSON.stringify(regionLayout) === JSON.stringify(layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "regions", targetEnabled: false, rulers: false, metadata: false }), regionContext)), "Region layout is deterministic")
  const boxes = regionLayout.elements.filter((e) => e.kind === ANNOTATION_KIND.box || e.kind === ANNOTATION_KIND.dashedBox || e.kind === ANNOTATION_KIND.brackets)
  assert(boxes.length === 3, `Each shape gets a box, the background none (${boxes.length})`)
  for (const [x0, y0, x1, y1] of field.rects) {
    const cx = ((x0 + x1) / 2 / FIELD_W) * aspect
    const cy = (y0 + y1) / 2 / FIELD_H
    const box = boxes.find((b) => Math.abs(b.x - cx) < 0.02 && Math.abs(b.y - cy) < 0.02)
    assert(box, `A box frames the shape ${[x0, y0, x1, y1]}`)
    assert(Math.abs(box.hw - ((x1 - x0) / 2 / FIELD_W) * aspect) < 0.02 && Math.abs(box.hh - (y1 - y0) / 2 / FIELD_H) < 0.02, "The box matches the shape bounds")
  }
  const boundaries = field.regions.regions.flatMap((r) => Array.from({ length: r.boundary.length / 2 }, (_, k) => [r.boundary[k * 2] * aspect, r.boundary[k * 2 + 1]]))
  const dots = regionLayout.elements.filter((e) => e.kind === ANNOTATION_KIND.dot)
  assert(dots.length >= 10, "Regions draw dots")
  for (const dot of dots) {
    const nearest = Math.min(...boundaries.map(([x, y]) => Math.hypot(x - dot.x, y - dot.y)))
    assert(nearest < 2 / FIELD_H, `Dots sit on region boundaries (${nearest.toFixed(3)})`)
  }
  const moved = syntheticField(1, field.regions)
  const movedLayout = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "regions", targetEnabled: false, rulers: false, metadata: false }), { aspect, time: 0, edges: moved.edges, regions: moved.regions })
  assert(movedLayout.elements.length === regionLayout.elements.length && movedLayout.glyphs.length === regionLayout.glyphs.length, "A small image change keeps the same marks")
  let jumps = 0
  let marks = 0
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const params = parseAnnotationConfig({ ...base(), seed, drift: 0, placement: "regions", targetEnabled: false, rulers: false, metadata: false, connectedDots: true })
    let previous = syntheticField(0)
    let before = layoutAnnotations(params, { aspect, time: 0, edges: previous.edges, regions: previous.regions })
    for (const shift of [1, 2, 3]) {
      const next = syntheticField(shift, previous.regions)
      const after = layoutAnnotations(params, { aspect, time: 0, edges: next.edges, regions: next.regions })
      assert(after.elements.length === before.elements.length, "A small image change keeps the same number of marks")
      for (const [i, element] of after.elements.entries()) {
        assert(element.kind === before.elements[i].kind, "Marks keep their kind")
        marks++
        if (Math.hypot(element.x - before.elements[i].x, element.y - before.elements[i].y) > 0.03) jumps++
      }
      previous = next
      before = after
    }
  }
  assert(jumps / marks < 0.03, `Marks follow small region changes without jumping (${jumps} of ${marks} jumped)`)
  const text = (layout) => layout.glyphs.map((g) => g.glyph).join()
  assert(text(movedLayout) === text(regionLayout), "Labels keep their words")
  const orientedShape = syntheticField()
  const tilted = layoutAnnotations(parseAnnotationConfig({ ...base(), drift: 0, placement: "regions", targetEnabled: false, rulers: false, metadata: false, alignToEdges: true }), { aspect, time: 0, edges: orientedShape.edges, regions: orientedShape.regions })
  const tiltedBoxes = tilted.elements.filter((e) => e.kind === ANNOTATION_KIND.box || e.kind === ANNOTATION_KIND.dashedBox || e.kind === ANNOTATION_KIND.brackets)
  assert(tiltedBoxes.length === 3 && tiltedBoxes.every((b) => Math.abs(Math.sin(b.rotation * 2)) < 0.05), "Aligned boxes on upright rectangles follow their long axis")
  const regionGraph = layoutAnnotations(parseAnnotationConfig({ ...linkOnly, placement: "regions", connectedDots: true }), regionContext)
  const regionNodes = regionGraph.elements.filter((e) => e.kind === ANNOTATION_KIND.dot)
  assert(regionNodes.length >= 10, "Region constellations appear")
  for (const node of regionNodes) {
    const nearest = Math.min(...boundaries.map(([x, y]) => Math.hypot(x - node.x, y - node.y)))
    assert(nearest < 3 / FIELD_H, "Region constellations trace boundaries")
  }
  samples += 12
  return samples
}

function linearToSrgb(value) {
  const v = Math.min(1, Math.max(0, value))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const W = 384
  const H = 216
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const context = canvas.getContext("2d")
  const paintShapes = (shift) => {
    context.fillStyle = "#707070"
    context.fillRect(0, 0, W, H)
    context.fillStyle = "#d84a3a"
    context.fillRect(40 + shift, 30, 100, 70)
    context.fillStyle = "#2a5fd0"
    context.fillRect(220, 90, 120, 100)
    context.fillStyle = "#e8e050"
    context.fillRect(60, 140, 80, 50)
  }
  paintShapes(0)
  const input = new THREE.CanvasTexture(canvas)
  input.colorSpace = THREE.SRGBColorSpace
  input.flipY = false
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  let samples = 0
  const renders = {}
  const regionSummaries = {}
  try {
    for (const [name, Pass] of [
      ["editor", AnnotationsPass],
      ["runtime", RuntimeAnnotations],
    ]) {
      const pass = new Pass(`${name}-annotation-extras`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      pass.resize(W, H)
      pass.updateLogicalSize(W, H)
      const settle = async (params) => {
        pass.updateParams({ ...base(), drift: 0, color: "#ff0000", strokeWidth: 3, targetEnabled: false, rulers: false, metadata: false, ...params })
        for (let frame = 0; frame < 4; frame++) {
          pass.render(renderer, input, target, 0, 1 / 30)
          if (pass.pendingReadback) await pass.pendingReadback
        }
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
      }
      renders.regions ??= {}
      renders.regions[name] = await settle({ placement: "regions" })
      const regions = pass.regions?.regions ?? []
      regionSummaries[name] = regions.map((r) => [r.id, Math.round(r.u * 1000), Math.round(r.v * 1000), Math.round(r.area * 1000)])
      assert(regions.length === 4, `${name}: the pass finds the three shapes and the ground (${regions.length})`)
      const red = regions.find((r) => Math.abs(r.u - 90 / W) < 0.03 && Math.abs(r.v - 65 / H) < 0.04)
      assert(red && Math.abs(red.u0 - 40 / W) < 0.02 && Math.abs(red.u1 - 140 / W) < 0.02, `${name}: the red shape's bounds come from the image ${JSON.stringify(regions.map((r) => [r.id, r.u.toFixed(3), r.v.toFixed(3), r.u0.toFixed(3), r.u1.toFixed(3), r.v0.toFixed(3), r.v1.toFixed(3), r.area.toFixed(3)]))}`)
      const field = pass.edges
      assert(field.color && field.angle, `${name}: the regions field carries color and edge angles`)
      const redCell = (Math.floor((65 / H) * FIELD_H) * FIELD_W + Math.floor((90 / W) * FIELD_W)) * 3
      const expectedLuma = 0.2126 * srgbToLinear(0xd8 / 255) + 0.7152 * srgbToLinear(0x4a / 255) + 0.0722 * srgbToLinear(0x3a / 255)
      assert(Math.abs(field.color[redCell] - expectedLuma) < 0.02 && field.color[redCell + 1] > 0.6, `${name}: the field reads the tone and color below (${field.color[redCell].toFixed(3)} vs ${expectedLuma.toFixed(3)})`)
      paintShapes(3)
      input.needsUpdate = true
      pass.setInputChanged(true)
      await settle({ placement: "regions" })
      assert(pass.regions.regions.map((r) => r.id).join() === regions.map((r) => r.id).join(), `${name}: region ids hold when the image moves slightly`)
      paintShapes(0)
      input.needsUpdate = true
      renders.aligned ??= {}
      renders.aligned[name] = await settle({ placement: "regions", alignToEdges: true, connectedDots: true })
      renders.edgesAligned ??= {}
      renders.edgesAligned[name] = await settle({ placement: "edges", alignToEdges: true })
      assert(pass.edges.angle, `${name}: Align to Edges reads edge angles`)
      renders.edgesPlain ??= {}
      renders.edgesPlain[name] = await settle({ placement: "edges" })
      assert(!pass.edges.color, `${name}: plain Edges keeps the original field`)
      renders.jitter ??= {}
      renders.jitter[name] = await settle({ rotationJitter: 0.7, connectedDots: true })
      samples += 9
      pass.dispose()
    }
    assert(JSON.stringify(regionSummaries.editor) === JSON.stringify(regionSummaries.runtime), "Editor and runtime find the same regions")
    samples++
    for (const [label, entry] of Object.entries(renders)) {
      let differing = 0
      let lit = 0
      for (let i = 0; i < entry.editor.length; i += 4) {
        if (entry.editor[i] > 0.3) lit++
        if (Math.abs(entry.editor[i] - entry.runtime[i]) > 0.02 || Math.abs(entry.editor[i + 3] - entry.runtime[i + 3]) > 0.02) differing++
      }
      const fraction = differing / (entry.editor.length / 4)
      assert(lit > 200, `${label}: marks render (${lit})`)
      assert(fraction < 0.005, `parity: ${label} differs on ${(fraction * 100).toFixed(2)}% of pixels`)
      samples++
    }
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
  }
  return samples
}

function imagePixels(canvas) {
  const copy = document.createElement("canvas")
  copy.width = canvas.width
  copy.height = canvas.height
  const context = copy.getContext("2d", { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  return context.getImageData(0, 0, copy.width, copy.height)
}

async function renderStill(project) {
  const state = buildViewerProjectState(parseLabProjectFileValue(project))
  const size = project.composition
  const canvas = document.createElement("canvas")
  const renderer = await createWebGPURenderer(canvas, { strictPassFailures: true })
  try {
    await renderer.initialize()
    renderer.resize(size, 1)
    const frame = buildRendererFrame({
      ...state,
      outputSize: size,
      viewportSize: size,
      delta: 0,
      clockTime: 0,
      pixelRatio: 1,
      timeline: { ...state.timeline, currentTime: 0, isPlaying: false },
    })
    renderer.render(frame)
    const deadline = performance.now() + 30_000
    while (renderer.hasPendingResources()) {
      if (performance.now() > deadline) throw new Error("Timed out loading the still")
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    for (let i = 0; i < 4; i++) {
      renderer.render(frame)
      await renderer.waitForGpuIdle()
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    renderer.render(frame)
    await renderer.waitForGpuIdle()
    const preview = imagePixels(canvas)
    const exported = imagePixels(renderer.exportFrame(frame, size))
    let changed = 0
    for (let i = 0; i < preview.data.length; i++) if (preview.data[i] !== exported.data[i]) changed++
    if (changed) throw new Error(`Preview/export mismatch on ${changed} channels`)
    const out = document.createElement("canvas")
    out.width = size.width
    out.height = size.height
    out.getContext("2d").putImageData(preview, 0, 0)
    return { image: preview, png: out.toDataURL("image/png") }
  } finally {
    renderer.dispose()
    await renderer.destroyDevice()
  }
}

function photoProject(params, size = { width: 1200, height: 720 }) {
  return {
    format: "shader-lab",
    version: 7,
    assets: [PHOTO],
    layers: [
      { ...createLayer("annotations"), id: "notes", params: { ...base(), color: "#f3efe4", ...params } },
      { ...createLayer("image"), id: "photo", assetId: PHOTO.id },
    ],
    selectedLayerId: "notes",
    composition: size,
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#0a0a0c" },
    timeline: { duration: 1, loop: true, tracks: [] },
  }
}

const STILLS = {
  regions: { placement: "regions", drift: 0 },
  regionsAligned: { placement: "regions", drift: 0, alignToEdges: true, colorMode: "palette" },
  connectedSeeded: { connectedDots: true, drift: 0, density: 0.7, dots: false, rings: false },
  connectedRegions: { placement: "regions", connectedDots: true, drift: 0, dots: false, crosses: false, rings: false, labels: false },
  jitter: { rotationJitter: 0.6, drift: 0, seed: 3 },
  edgesAligned: { placement: "edges", alignToEdges: true, drift: 0, targetSnap: true },
}

async function projectChecks(renderProject) {
  let samples = 0
  const definition = getLayerDefinition("annotations")
  const param = (key) => definition.params.find((entry) => entry.key === key)
  assert(param("placement").options.some((o) => o.value === "regions"), "Placement offers Regions")
  assert(param("connectedDots").defaultValue === false && param("rotationJitter").defaultValue === 0 && param("alignToEdges").defaultValue === false, "New controls start neutral")
  const visible = (key, placement) => isParamVisible(param(key), { ...base(), placement }, definition.params, "annotations")
  assert(visible("alignToEdges", "edges") && visible("alignToEdges", "regions") && !visible("alignToEdges", "random") && !visible("alignToEdges", "painted"), "Align to Edges shows with Edges and Regions only")
  assert(visible("targetSnap", "regions") && visible("targetSnap", "edges") && !visible("targetSnap", "random"), "Snap shows with Edges and Regions")
  samples += 4

  const project = photoProject({ placement: "regions", connectedDots: true, rotationJitter: 0.4, alignToEdges: true, seed: 12 }, { width: 384, height: 216 })
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  store().updateLayerParam("notes", "rotationJitter", 0.9)
  store().updateLayerParam("notes", "connectedDots", false)
  assert(store().getLayerById("notes").params.rotationJitter === 0.9, "Edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(store().getLayerById("notes").params.rotationJitter === 0.4 && store().getLayerById("notes").params.connectedDots === true, "Undo restores the new controls")
  const duplicateId = store().duplicateLayer("notes")
  const duplicate = store().getLayerById(duplicateId)
  assert(duplicate.params.placement === "regions" && duplicate.params.connectedDots === true && duplicate.params.rotationJitter === 0.4, "Duplicates keep the new controls")
  store().updateLayerParam(duplicateId, "placement", "random")
  assert(store().getLayerById("notes").params.placement === "regions", "Editing a duplicate leaves the original")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile().layers.find((l) => l.id === "notes")
  assert(reopened.params.placement === "regions" && reopened.params.connectedDots === true && reopened.params.rotationJitter === 0.4 && reopened.params.alignToEdges === true, "Save/reopen keeps the new controls")
  const exported = buildShaderExportConfig(buildLabProjectFile()).layers.find((l) => l.id === "notes")
  assert(exported.type === "annotations" && exported.params.placement === "regions" && exported.params.connectedDots === true && exported.params.rotationJitter === 0.4, "Shader export carries the new controls")
  samples += 6

  const first = await renderStill(saved)
  const second = await renderStill(buildLabProjectFile())
  let diff = 0
  for (let i = 0; i < first.image.data.length; i++) diff = Math.max(diff, Math.abs(first.image.data[i] - second.image.data[i]))
  assert(diff === 0, `Reopened region annotations render the same pixels (${diff})`)
  samples++

  const legacyLayer = { ...createLayer("annotations"), id: "legacy", params: legacyParams({ ...base(), drift: 0, seed: 9 }) }
  const legacy = { ...saved, layers: [legacyLayer, saved.layers.find((l) => l.id === "photo")], selectedLayerId: "legacy" }
  const neutralLayer = { ...legacyLayer, params: { ...legacyLayer.params, rotationJitter: 0, alignToEdges: false, connectedDots: false } }
  const legacyRender = await renderProject(legacy)
  const neutralRender = await renderProject({ ...legacy, layers: [neutralLayer, legacy.layers[1]] })
  let legacyDiff = 0
  for (let i = 0; i < legacyRender.image.data.length; i++) legacyDiff = Math.max(legacyDiff, Math.abs(legacyRender.image.data[i] - neutralRender.image.data[i]))
  assert(legacyDiff === 0, `A saved project without the new controls renders like neutral values (${legacyDiff})`)
  samples++

  const stills = {}
  for (const [name, params] of Object.entries(STILLS)) {
    stills[name] = (await renderStill(photoProject(params))).png
    samples++
  }
  return { samples, stills }
}

function fieldView(pass, deco, photo, W, H) {
  const composite = new ImageData(W, H)
  const map = new ImageData(W, H)
  const labels = pass.regions.labels
  const palette = new Map()
  const probe = document.createElement("canvas").getContext("2d")
  const colorOf = (id) => {
    if (!palette.has(id)) {
      probe.fillStyle = `hsl(${(id * 137.5) % 360}, 70%, 55%)`
      palette.set(id, probe.fillStyle.match(/[0-9a-f]{2}/gi).map((h) => Number.parseInt(h, 16)))
    }
    return palette.get(id)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const a = deco[i + 3]
      for (let c = 0; c < 3; c++) composite.data[i + c] = Math.round(linearToSrgb(deco[i + c] + srgbToLinear(photo.data[i + c] / 255) * (1 - a)) * 255)
      composite.data[i + 3] = 255
      map.data[i + 3] = 255
      const id = labels[Math.min(FIELD_H - 1, Math.floor((y / H) * FIELD_H)) * FIELD_W + Math.min(FIELD_W - 1, Math.floor((x / W) * FIELD_W))]
      if (!id) continue
      const rgb = colorOf(id)
      for (let c = 0; c < 3; c++) map.data[i + c] = Math.round(photo.data[i + c] * 0.35 + rgb[c] * 0.65)
    }
  }
  const out = document.createElement("canvas")
  out.width = W * 2
  out.height = H
  out.getContext("2d").putImageData(composite, 0, 0)
  out.getContext("2d").putImageData(map, W, 0)
  return out.toDataURL("image/png")
}

async function fieldStudy(params, photoVariants) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const out = { frames: {} }
  const run = async (name, width, height, frames, draw, variant = params, W = 640) => {
    const H = Math.round((W * height) / width)
    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H
    const context = canvas.getContext("2d", { willReadFrequently: true })
    const input = new THREE.CanvasTexture(canvas)
    input.colorSpace = THREE.SRGBColorSpace
    input.flipY = false
    const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
    const pass = new AnnotationsPass(`${name}-annotations`)
    pass.updateCompositionRole("effect")
    pass.flushColorNode()
    pass.resize(W, H)
    pass.updateLogicalSize(W, H)
    pass.updateParams({ ...base(), color: "#f3efe4", ...variant })
    const seen = new Set()
    const counts = []
    let churn = 0
    let previousIds = null
    try {
      for (const [frame, keep] of frames) {
        await draw(context, frame, W, H)
        input.needsUpdate = true
        pass.setInputChanged(true)
        for (let settle = 0; settle < (frames.length === 1 ? 4 : 1); settle++) {
          pass.render(renderer, input, target, frame / 24, 1 / 24)
          if (pass.pendingReadback) await pass.pendingReadback
        }
        const ids = (pass.regions?.regions ?? []).map((r) => r.id)
        for (const id of ids) seen.add(id)
        counts.push(ids.length)
        if (previousIds) churn += ids.filter((id) => !previousIds.includes(id)).length
        previousIds = ids
        if (!keep) continue
        const deco = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)
        out.frames[`${name}${frames.length > 1 ? frame : ""}`] = fieldView(pass, deco, context.getImageData(0, 0, W, H), W, H)
      }
    } finally {
      pass.dispose()
      input.dispose()
      target.dispose()
    }
    return { totalIds: seen.size, meanRegions: counts.reduce((a, b) => a + b, 0) / counts.length, newIdsPerFrame: counts.length > 1 ? churn / (counts.length - 1) : 0 }
  }
  try {
    const photo = new Image()
    photo.src = PHOTO.url
    await photo.decode()
    for (const [name, variant] of Object.entries(photoVariants))
      await run(name, photo.naturalWidth, photo.naturalHeight, [[0, true]], (context, _frame, W, H) => context.drawImage(photo, 0, 0, W, H), { ...params, ...variant }, 1200)
    const video = document.createElement("video")
    video.src = "/scenes/default/aura.mp4"
    video.muted = true
    video.playsInline = true
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve
      video.onerror = reject
    })
    const keep = new Set([12, 36, 60])
    out.video = await run(
      "video",
      video.videoWidth,
      video.videoHeight,
      Array.from({ length: 72 }, (_, frame) => [frame, keep.has(frame)]),
      async (context, frame, W, H) => {
        await new Promise((resolve) => {
          video.onseeked = resolve
          video.currentTime = frame / 24
        })
        context.drawImage(video, 0, 0, W, H)
      }
    )
  } finally {
    renderer.dispose()
  }
  return out
}

export async function checkAnnotationExtras(renderProject) {
  const segment = segmentChecks()
  let samples = segment.samples
  samples += layoutChecks()
  samples += await passChecks()
  const project = await projectChecks(renderProject)
  samples += project.samples
  const study = await fieldStudy({ placement: "regions", drift: 0, connectedDots: true, colorMode: "palette" }, {
    photoRegions: { connectedDots: false, colorMode: "mono" },
    photoAligned: { alignToEdges: true, connectedDots: false },
    photoConnected: { dots: false, crosses: false, rings: false, rulers: false, metadata: false, targetEnabled: false },
  })
  assert(study.video.meanRegions >= 3, `Video frames have regions (${study.video.meanRegions})`)
  assert(study.video.newIdsPerFrame < 0.5, `Region ids stay stable on video (${study.video.newIdsPerFrame.toFixed(2)} new per frame)`)
  samples += 2
  return { samples, stills: project.stills, field: study.frames, videoStats: study.video }
}
