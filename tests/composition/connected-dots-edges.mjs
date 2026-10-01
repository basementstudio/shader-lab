import { ConnectedDotsPass as RuntimeDots } from "@runtime/renderer/connected-dots-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ConnectedDotsPass } from "@/renderer/connected-dots-pass"
import { serializeGradientMapStops } from "@/renderer/color-map-lut"
import {
  CONNECTED_DOTS_STYLES,
  connectedDotsStyleParams,
  DEFAULT_CONNECTED_DOTS_STYLE,
  matchConnectedDotsStyle,
} from "@/lib/editor/config/connected-dots-styles"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
function close(actual, expected, label, tolerance = 0.01) {
  assert(actual.length === expected.length, `${label}: wrong size`)
  actual.forEach((value, i) => {
    assert(
      Number.isFinite(value) && Math.abs(value - expected[i]) <= tolerance,
      `${label}: ${i} got ${value}, expected ${expected[i]}`
    )
  })
}
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const S = 96
const SPACING = 12
const MARGIN = 2
const EDGE = 50
const EDGE_CELL = Math.floor(EDGE / SPACING)
const N = 64
const NEW_STYLES = ["contour-graph", "facets"]

const BASE = {
  stops: serializeGradientMapStops([
    { position: 0, color: "#000000" },
    { position: 1, color: "#ff0000" },
  ]),
  mode: "graph",
  spacing: SPACING,
  jitter: 0.9,
  cutoff: 0,
  invert: false,
  dotShape: "circle",
  minSize: 0.3,
  maxSize: 0.3,
  links: 0,
  linkThreshold: 0.3,
  linkMin: 0.15,
  linkMax: 0.15,
  blobiness: 0.5,
  range: 1.6,
  lineWidth: 1,
  meshFill: 0,
  wire: 1,
  wireColor: "#000000",
  colorMode: "ink",
  ink: "#000000",
  background: "color",
  backgroundColor: "#ffffff",
  drift: 0,
  speed: 0,
  seed: 0,
}

function noise(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v) - 0.5
}

function unitChecks() {
  const param = getLayerDefinition("connected-dots").params.find((p) => p.key === "edgeSnap")
  assert(param && param.defaultValue === 0 && param.min === 0 && param.max === 1, "Edge Snap control defaults to 0")
  const layer = createLayer("connected-dots")
  assert(layer.params.edgeSnap === 0, "New layers do not snap")
  assert(matchConnectedDotsStyle(layer.params) === DEFAULT_CONNECTED_DOTS_STYLE.id, "New layers still start on Portrait Graph")
  for (const style of CONNECTED_DOTS_STYLES) {
    const snaps = style.values.edgeSnap > 0
    assert(snaps === NEW_STYLES.includes(style.id), `${style.id}: only the new styles snap`)
    assert(
      matchConnectedDotsStyle({ ...layer.params, ...connectedDotsStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  }
  assert(matchConnectedDotsStyle({ ...layer.params, edgeSnap: 0.5 }) === "custom", "Edge Snap on Portrait Graph shows Custom")
  const contour = CONNECTED_DOTS_STYLES.find((s) => s.id === "contour-graph")
  assert(
    matchConnectedDotsStyle({ ...layer.params, ...connectedDotsStyleParams(contour), edgeSnap: 0 }) === "custom",
    "Contour Graph without snapping is Custom"
  )
  return 5 + CONNECTED_DOTS_STYLES.length * 2
}

function makeInput(fn) {
  const data = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const value = fn(x, y)
      data.set(value.length === 4 ? value : [...value, 1], (y * S + x) * 4)
    }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const gray = linear(0.5)
  const inputs = {
    flat: makeInput(() => [gray, gray, gray]),
    flatNoisy: makeInput((x, y) => {
      const v = linear(0.5 + (noise(x, y) * 4) / 255)
      return [v, v, v]
    }),
    step: makeInput((x) => (x < EDGE ? [0, 0, 0] : [1, 1, 1])),
    stepLevels: makeInput((x) => {
      const v = linear(x < EDGE ? 0.15 : 0.9)
      return [v, v, v]
    }),
    stepNoisy: makeInput((x, y) => {
      const v = linear((x < EDGE ? 0.15 : 0.9) + (noise(x, y) * 4) / 255)
      return [v, v, v]
    }),
    line: makeInput((x) => (x >= EDGE && x < EDGE + 3 ? [0, 0, 0] : [1, 1, 1])),
    cutout: makeInput((x) => (x < EDGE ? [0, 0, 0, 1] : [0, 0, 0, 0])),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ConnectedDotsPass],
      ["runtime", RuntimeDots],
    ]) {
      const pass = new Pass(`edges-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const render = async (input, params) => {
        pass.resize(S, S)
        pass.updateLogicalSize(S, S)
        pass.updateParams({ ...BASE, ...params })
        pass.render(renderer, inputs[input], target, 0, 0)
        const out = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, S, S))
        const grid = pass.siteTarget
        const raw = Array.from(await renderer.readRenderTargetPixelsAsync(grid, 0, 0, grid.width, grid.height))
        const mesh = params.mode === "mesh"
        const sites = []
        const columns = Math.floor(S / SPACING)
        for (let cy = 0; cy < columns; cy++)
          for (let cx = 0; cx < columns; cx++) {
            const i = ((cy + MARGIN) * grid.width + cx + MARGIN) * 4
            const x = mesh ? raw[i] : raw[i] * S
            const y = mesh ? raw[i + 1] : raw[i + 1] * S
            sites.push({ cx, cy, x, y, tone: raw[i + 2], present: raw[i + 3] })
          }
        return { out, sites }
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const shift = (a, b) => Math.max(...a.sites.map((s, i) => Math.hypot(s.x - b.sites[i].x, s.y - b.sites[i].y)))
      const edgeCells = (r) => r.sites.filter((s) => s.cx === EDGE_CELL)
      const farCells = (r) => r.sites.filter((s) => Math.abs(s.cx - EDGE_CELL) >= 2)

      const implicit = await render("step", {})
      const zero = await render("step", { edgeSnap: 0 })
      close(zero.out, implicit.out, `${name}: Edge Snap 0 renders like a layer without the control`, 0)
      close(zero.sites.map((s) => s.x), implicit.sites.map((s) => s.x), `${name}: Edge Snap 0 keeps every site`, 0)
      samples += 2

      const flat = await render("flat", { edgeSnap: 0 })
      const flatSnapped = await render("flat", { edgeSnap: 1 })
      assert(shift(flat, flatSnapped) < 1e-3, `${name}: without edges no site moves (${shift(flat, flatSnapped)})`)
      close(flatSnapped.out, flat.out, `${name}: a flat image renders the same with snapping`, 1e-5)
      const grain = await render("flatNoisy", { edgeSnap: 1 })
      assert(shift(flat, grain) < 0.05, `${name}: faint grain does not pull sites (${shift(flat, grain)})`)
      samples += 3

      const loose = edgeCells(zero)
      const snapped = await render("step", { edgeSnap: 1 })
      const onEdge = edgeCells(snapped)
      const looseMiss = loose.reduce((sum, s) => sum + Math.abs(s.x - EDGE), 0) / loose.length
      assert(looseMiss > 2, `${name}: jittered sites scatter across the edge cell (${looseMiss})`)
      for (const s of onEdge)
        assert(Math.abs(s.x - EDGE) <= 1.5, `${name}: snapped site ${s.cx},${s.cy} lands on the edge (x ${s.x})`)
      for (const [i, s] of onEdge.entries())
        assert(Math.abs(s.y - loose[i].y) < SPACING * 0.5, `${name}: snapping keeps the site in its row (${s.y} vs ${loose[i].y})`)
      assert(shift({ sites: farCells(zero) }, { sites: farCells(snapped) }) < 1e-3, `${name}: sites away from the edge keep their place`)
      assert(!pass.needsContinuousRender(), `${name}: snapping alone needs no continuous render`)
      record("graph step", snapped.out)
      samples += 4

      const half = await render("step", { edgeSnap: 0.5 })
      const halfEdge = edgeCells(half)
      for (const [i, s] of halfEdge.entries()) {
        const expected = (loose[i].x + onEdge[i].x) / 2
        assert(Math.abs(s.x - expected) < 0.05, `${name}: Edge Snap 0.5 moves halfway (${s.x} vs ${expected})`)
      }
      samples++

      const levels = await render("stepLevels", { edgeSnap: 1 })
      const noisy = await render("stepNoisy", { edgeSnap: 1 })
      assert(shift(levels, noisy) < 0.5, `${name}: noise barely moves snapped sites (${shift(levels, noisy)})`)
      samples++

      const lineLoose = await render("line", { edgeSnap: 0 })
      const lineSnapped = await render("line", { edgeSnap: 1 })
      const inside = (r) => edgeCells(r).filter((s) => s.x >= EDGE - 0.5 && s.x <= EDGE + 3.5).length
      assert(inside(lineSnapped) === edgeCells(lineSnapped).length, `${name}: sites move onto a thin dark line (${inside(lineSnapped)})`)
      assert(inside(lineLoose) < edgeCells(lineLoose).length * 0.6, `${name}: loose sites mostly miss the thin line (${inside(lineLoose)})`)
      const lineTone = edgeCells(lineSnapped).reduce((sum, s) => sum + s.tone, 0) / edgeCells(lineSnapped).length
      assert(lineTone > 0.5, `${name}: dots on a thin line take its dark tone (${lineTone})`)
      record("graph line", lineSnapped.out)
      samples += 3

      const cutLoose = await render("cutout", { edgeSnap: 0 })
      const cutSnapped = await render("cutout", { edgeSnap: 1 })
      for (const s of edgeCells(cutSnapped))
        assert(Math.abs(s.x - EDGE) <= 1.5, `${name}: sites snap to a cutout edge (x ${s.x})`)
      assert(
        edgeCells(cutSnapped).filter((s) => s.present > 0.5).length > edgeCells(cutLoose).filter((s) => s.present > 0.5).length * 0.5,
        `${name}: snapped cutout sites stay on the opaque side`
      )
      samples += 2

      for (const mode of ["blobs", "plexus"]) {
        const a = await render("step", { mode, edgeSnap: 0 })
        const b = await render("step", { mode, edgeSnap: 1 })
        assert(shift(a, b) > 2, `${name}: ${mode} snaps too`)
        assert(b.out.some((v, i) => Math.abs(v - a.out[i]) > 0.1), `${name}: ${mode} output follows the moved sites`)
        record(`${mode} step`, b.out)
      }
      samples += 2

      const band = (r) => {
        let rows = 0
        for (let y = 0; y < S; y++) {
          let hit = false
          for (let x = EDGE - 2; x <= EDGE + 1; x++) if (r.out[(y * S + x) * 4 + 1] < 0.5) hit = true
          if (hit) rows++
        }
        return rows / S
      }
      const meshLoose = await render("step", { mode: "mesh", edgeSnap: 0 })
      const meshSnapped = await render("step", { mode: "mesh", edgeSnap: 1 })
      for (const s of edgeCells(meshSnapped))
        assert(Math.abs(s.x - EDGE) <= 1.5, `${name}: mesh vertices land on the edge (x ${s.x})`)
      assert(band(meshSnapped) > 0.9 && band(meshSnapped) > band(meshLoose) + 0.1, `${name}: mesh edges run along the image edge (${band(meshSnapped)} vs ${band(meshLoose)})`)
      record("mesh step", meshSnapped.out)
      const meshFill = await render("step", { mode: "mesh", edgeSnap: 1, meshFill: 1, wire: 0, colorMode: "source" })
      const leftFacet = meshFill.out[(40 * S + 20) * 4]
      const rightFacet = meshFill.out[(40 * S + 80) * 4]
      assert(leftFacet < 0.05 && rightFacet > 0.95, `${name}: filled facets keep flat tones on each side (${leftFacet}, ${rightFacet})`)
      record("mesh fill", meshFill.out)
      samples += 3

      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results))
      close(entry.editor, entry.runtime, `parity: ${label}`, 0.004)
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    for (const input of Object.values(inputs)) input.dispose()
    renderer.dispose()
  }
  return samples
}

async function runtimeRender(config) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const compiling = []
  const compile = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const pending = compile(...args)
    compiling.push(pending)
    return pending
  }
  const headless = createHeadlessRenderer({ renderer, size: config.composition })
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, config.composition)
    headless.render(frame)
    while (compiling.length) await Promise.all(compiling.splice(0))
    material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
}

function stripes(id) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    params: {
      ...layer.params,
      animate: false,
      tonemapMode: "none",
      grainAmount: 0,
      glowStrength: 0,
      vignetteStrength: 0,
    },
  }
}

export async function checkConnectedDotsEdges(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const legacyGrid = createLayer("connected-dots")
  delete legacyGrid.params.edgeSnap
  const legacy = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [{ ...legacyGrid, id: "legacy" }, stripes("legacy-field")],
    selectedLayerId: "legacy",
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(legacy), [])
  const store = () => useLayerStore.getState()
  const hydrated = store().getLayerById("legacy").params
  assert(hydrated.edgeSnap === 0, "Saved projects without Edge Snap open at 0")
  assert(matchConnectedDotsStyle(hydrated) === DEFAULT_CONNECTED_DOTS_STYLE.id, "Saved Portrait Graph layers keep their style")
  samples += 2

  const contour = CONNECTED_DOTS_STYLES.find((s) => s.id === "contour-graph")
  const grid = { ...createLayer("connected-dots"), id: "grid" }
  grid.params = { ...grid.params, ...connectedDotsStyleParams(contour), spacing: 8 }
  const project = { ...legacy, layers: [grid, stripes("field")], selectedLayerId: grid.id }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const before = buildEditorHistorySnapshot()
  store().updateLayerParam(grid.id, "edgeSnap", 0.25)
  assert(store().getLayerById(grid.id).params.edgeSnap === 0.25, "Edge Snap edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(store().getLayerById(grid.id).params.edgeSnap === 1, "Undo restores Edge Snap")
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "edgeSnap", 0)
  assert(store().getLayerById(grid.id).params.edgeSnap === 1, "Duplicates snap independently")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(reopenedGrid.params.edgeSnap === 1 && matchConnectedDotsStyle(reopenedGrid.params) === "custom", "Save/reopen keeps Edge Snap")
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).params.edgeSnap === 1, "Shader export keeps Edge Snap")
  samples += 5

  const first = await renderProject(saved)
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)
  const loose = await renderProject({
    ...saved,
    layers: saved.layers.map((l) => (l.id === grid.id ? { ...l, params: { ...l.params, edgeSnap: 0 } } : l)),
  })
  assert(
    Array.from(first.image.data).some((v, i) => v !== loose.image.data[i]),
    "Edge Snap changes the composited frame"
  )
  const runtimePixels = await runtimeRender(config)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime edge snapping parity",
    0.02
  )
  samples += 3

  const renders = {}
  const study = {
    id: "study-color",
    kind: "image",
    url: "/scenes/default/dof-study.png",
    fileName: "study.png",
    width: 540,
    height: 780,
  }
  const flora = {
    id: "flora",
    kind: "image",
    url: "/scenes/default/editorial/flora.webp",
    fileName: "flora.webp",
    width: 1512,
    height: 908,
  }
  for (const [asset, size] of [
    [study, { width: 540, height: 780 }],
    [flora, { width: 756, height: 454 }],
  ])
    for (const id of ["portrait-graph", "contour-graph", "low-poly", "facets"]) {
      const style = CONNECTED_DOTS_STYLES.find((s) => s.id === id)
      const base = createLayer("connected-dots")
      const photo = { ...createLayer("image"), id: "photo", assetId: asset.id }
      photo.params = { ...photo.params, fitMode: "cover" }
      const rendered = await renderProject({
        ...saved,
        composition: size,
        assets: [asset],
        layers: [{ ...base, id: "styled", params: { ...base.params, ...connectedDotsStyleParams(style) } }, photo],
        selectedLayerId: "styled",
      })
      renders[`${asset.id}-${id}`] = rendered.png
      samples++
    }
  return { samples, renders }
}
