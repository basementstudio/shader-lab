import { PassNode as RuntimePassNode } from "@runtime/renderer/pass-node"
import { PhotographicCellsPass as RuntimeCells } from "@runtime/renderer/photographic-cells-pass"
import { PipelineManager as RuntimePipeline } from "@runtime/renderer/pipeline-manager"
import { reverseComposition as reverseRuntime } from "@runtime/renderer/composition-tree"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2, vec4 } from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import { PhotographicCellsPass } from "@/renderer/photographic-cells-pass"
import { PipelineManager as EditorPipeline } from "@/renderer/pipeline-manager"
import { reverseComposition } from "@/renderer/composition-tree"
import {
  layerMaskSignature,
  normalizeLayerMask,
} from "@/renderer/layer-mask"
import {
  emptyCellPaintMask,
  encodeCellPaintMask,
} from "@/renderer/cell-paint-mask"
import { paintCellSegment } from "@/lib/editor/paint/cell-paint-brush"
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
import {
  canPaintMaskLayer,
  useCellPaintStore,
  withCellPaintPreview,
} from "@/store/cell-paint-store"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_LAYER_MASK, DEFAULT_SCENE_CONFIG } from "@/types/editor"

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
const mix = (a, b, m) => a.map((v, i) => v + (b[i] - v) * m)
const N = 64
const index = (v) => Math.min(N - 1, Math.max(0, Math.round((v + 0.5) * N - 0.5)))

class SolidPass extends PassNode {
  constructor(id, color) {
    super(id)
    this.color = color
    this.rebuildEffectNode()
  }
  buildEffectNode() {
    return this.color ? vec4(...this.color) : this.inputNode
  }
}
class RuntimeSolidPass extends RuntimePassNode {
  constructor(id, color) {
    super(id)
    this.color = color
    this.rebuildEffectNode()
  }
  buildEffectNode() {
    return this.color ? vec4(...this.color) : this.inputNode
  }
}

const mask = (overrides) => ({ ...DEFAULT_LAYER_MASK, ...overrides })

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const makeInput = (color) => {
    const tex = new THREE.DataTexture(
      new Float32Array(color),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    tex.needsUpdate = true
    return tex
  }
  const input = [0.2, 0.4, 0.6, 1]
  const opaque = makeInput(input)
  const clear = makeInput([0, 0, 0, 0])
  const red = [1, 0, 0, 1]
  const target = new THREE.RenderTarget(N, N, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const brush = emptyCellPaintMask()
  paintCellSegment(brush, { x: -0.4, y: -0.3 }, { x: 0.4, y: -0.3 }, 0.05, false)
  const painted = encodeCellPaintMask(brush)
  let samples = 0
  const results = {}
  try {
    for (const [name, Solid, Cells] of [
      ["editor", SolidPass, PhotographicCellsPass],
      ["runtime", RuntimeSolidPass, RuntimeCells],
    ]) {
      const pass = new Solid(`solid-${name}`, red)
      const render = async (role, layerMask, source = opaque) => {
        pass.updateCompositionRole(role)
        pass.updateLayerMask(layerMask ? normalizeLayerMask(layerMask) : null)
        pass.resize(N, N)
        pass.updateMaskLogicalSize(N, N)
        pass.flushColorNode()
        pass.render(renderer, source, target, 0, 0)
        const pixels = Array.from(
          await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N)
        )
        return (x, y) => {
          const i = (index(y) * N + index(x)) * 4
          return pixels.slice(i, i + 4)
        }
      }
      const check = (label, actual, expected, tolerance) => {
        close(actual, expected, `${name}: ${label}`, tolerance)
        results[label] ??= {}
        results[label][name] = actual
        samples++
      }

      let at = await render("effect", null)
      check("control", at(0, 0), red)
      check("control corner", at(-0.45, 0.45), red)

      at = await render("effect", mask({ shape: "ellipse", size: [0.5, 0.5] }))
      check("ellipse center", at(0, 0), red)
      check("ellipse inside", at(0.18, 0), red)
      check("ellipse outside", at(0.4, 0), input)
      check("ellipse corner", at(-0.45, -0.45), input)

      at = await render(
        "effect",
        mask({ shape: "ellipse", size: [0.5, 0.5], invert: true })
      )
      check("inverted ellipse center", at(0, 0), input)
      check("inverted ellipse corner", at(-0.45, -0.45), red)

      at = await render(
        "effect",
        mask({ shape: "rectangle", size: [0.5, 0.25], feather: 0 })
      )
      check("rectangle along width", at(0.2, 0), red)
      check("rectangle beyond height", at(0, 0.2), input)
      check("rectangle beyond width", at(0.3, 0), input)

      at = await render(
        "effect",
        mask({ shape: "rectangle", size: [0.5, 0.25], rotation: 90, feather: 0 })
      )
      check("rotated rectangle along height", at(0, 0.2), red)
      check("rotated rectangle beyond", at(0.2, 0), input)

      at = await render(
        "effect",
        mask({ shape: "rectangle", size: [0.5, 0.5], feather: 0.1 })
      )
      check("feather edge", at(0.25, 0), mix(input, red, 0.5), 0.08)
      check("feather inside", at(0.1, 0), red, 0.02)
      check("feather outside", at(0.4, 0), input, 0.02)

      at = await render("effect", mask({ shape: "linear", size: [1, 1] }))
      check("linear start", at(-0.4, 0), mix(input, red, 0.9), 0.03)
      check("linear middle", at(0, 0), mix(input, red, 0.5), 0.03)
      check("linear end", at(0.4, 0), mix(input, red, 0.1), 0.03)
      check("linear ignores y", at(0, 0.4), mix(input, red, 0.5), 0.03)

      at = await render(
        "effect",
        mask({ shape: "linear", size: [1, 1], rotation: 90 })
      )
      const rows = [at(0, -0.4), at(0, 0.4)]
      check(
        "vertical linear spans",
        [rows[0][0] + rows[1][0]],
        [mix(input, red, 0.9)[0] + mix(input, red, 0.1)[0]],
        0.05
      )
      check("vertical linear ignores x", at(0.4, 0), mix(input, red, 0.5), 0.03)

      at = await render("effect", mask({ shape: "radial", size: [1, 1] }))
      check("radial center", at(0, 0), red, 0.03)
      check("radial half", at(0.25, 0), mix(input, red, 0.5), 0.04)
      check("radial outside", at(0.45, 0.45), input, 0.02)

      at = await render(
        "effect",
        mask({ shape: "ellipse", size: [0.5, 0.5], enabled: false })
      )
      check("disabled mask", at(-0.45, -0.45), red)
      at = await render("effect", mask({ shape: "none" }))
      check("shape none", at(-0.45, -0.45), red)

      at = await render(
        "effect",
        mask({ shape: "ellipse", size: [0.5, 0.5], scope: "content" })
      )
      check("cut content inside", at(0, 0), red)
      check("cut content outside alpha", [at(-0.45, -0.45)[3]], [0])
      at = await render(
        "source",
        mask({ shape: "ellipse", size: [0.5, 0.5], scope: "content" })
      )
      check("source content equals limit", at(-0.45, -0.45), input)

      at = await render(
        "source",
        mask({ shape: "ellipse", size: [0.5, 0.5], feather: 0.1 }),
        clear
      )
      check("transparent input center", at(0, 0), red)
      const edge = at(0.25, 0)
      check("transparent input edge alpha", [edge[3]], [0.5], 0.08)
      check("no black halo", edge.slice(0, 3), [1, 0, 0], 0.02)
      check("transparent input outside", at(-0.45, -0.45), [0, 0, 0, 0])

      at = await render("effect", mask({ shape: "brush", paint: painted }))
      check("brush unpainted center", at(0, 0), input)
      const strokeRows = [at(0, -0.3), at(0, 0.3)]
      const paintedRow = strokeRows.findIndex((p) => p[0] > 0.9)
      assert(paintedRow !== -1, `${name}: brush stroke missing`)
      check(
        "brush other row untouched",
        strokeRows[1 - paintedRow],
        input
      )
      check("brush outside stroke x", at(0.47, -0.3), input)
      results["brush row"] ??= {}
      results["brush row"][name] = paintedRow

      const cells = new Cells(`cells-${name}`)
      cells.updateCompositionRole("transform")
      cells.resize(N, N)
      cells.updateLogicalSize(N, N)
      cells.updateParams({
        threshold: 0,
        gap: 0,
        outline: 0,
        irregularity: 0,
        size: 0.03,
        mode: "paint",
        paintMask: painted,
        output: "cutout",
      })
      cells.updateOpacity(1)
      cells.flushColorNode()
      cells.render(renderer, opaque, target, 0, 0)
      const cellPixels = Array.from(
        await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N)
      )
      const cellAlpha = (y) =>
        cellPixels[(index(y) * N + index(0)) * 4 + 3]
      const cellRow = [cellAlpha(-0.3), cellAlpha(0.3)].findIndex((a) => a > 0.5)
      assert(
        cellRow === paintedRow,
        `${name}: brush mask row ${paintedRow} differs from Cells paint row ${cellRow}`
      )
      samples++
      cells.dispose()
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results)) {
      if (Array.isArray(entry.editor))
        close(entry.editor, entry.runtime, `parity: ${label}`, 0.002)
      else assert(entry.editor === entry.runtime, `parity: ${label}`)
    }
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    opaque.dispose()
    clear.dispose()
    renderer.dispose()
  }
  return samples
}

function solid(id, color, opacity = 1) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    opacity,
    params: {
      ...layer.params,
      animate: false,
      tonemapMode: "none",
      grainAmount: 0,
      glowStrength: 0,
      vignetteStrength: 0,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((i) => [`point${i}Color`, color])
      ),
    },
  }
}
function group(id, children, options = {}) {
  return {
    id,
    kind: "group",
    children,
    blendMode: "normal",
    opacity: 1,
    visible: true,
    ...options,
  }
}
function editorNodes(nodes) {
  return nodes.map((node) =>
    node.kind === "group"
      ? { ...node, children: editorNodes(node.children) }
      : { layer: node, params: node.params, asset: null }
  )
}

async function pipelineChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setSize(N, N, false)
  const compilations = []
  const compileAsync = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const promise = compileAsync(...args)
    compilations.push(promise)
    return promise
  }
  const settle = async () => {
    while (compilations.length) await Promise.all(compilations.splice(0))
  }
  const output = new THREE.RenderTarget(N, N, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const read = async (input) => {
    material.colorNode = texture(input)
    material.needsUpdate = true
    renderer.setRenderTarget(output)
    renderer.render(scene, camera)
    return Array.from(
      await renderer.readRenderTargetPixelsAsync(output, 0, 0, N, N)
    )
  }
  const red = solid("red", "#ff0000")
  const green = solid("green", "#00ff00", 0.5)
  const blue = solid("blue", "#0000ff")
  const ellipse = mask({ shape: "ellipse", size: [0.5, 0.5], feather: 0 })
  const threshold = {
    ...createLayer("threshold"),
    id: "threshold",
    params: { threshold: 0.1, softness: 0.01, noise: 0 },
  }
  const cases = [
    [
      "ellipse cuts the group only",
      [green, group("g", [red], { mask: ellipse }), blue],
      { center: [0.5, 0.5, 0, 1], corner: [0, 0.5, 0.5, 1] },
    ],
    [
      "inverted group mask",
      [group("g", [red], { mask: { ...ellipse, invert: true } }), blue],
      { center: [0, 0, 1, 1], corner: [1, 0, 0, 1] },
    ],
    [
      "effect limited inside a group",
      [group("g", [{ ...threshold, mask: ellipse }, red]), blue],
      { center: [1, 1, 1, 1], corner: [1, 0, 0, 1] },
    ],
    [
      "effect cuts group content",
      [
        group("g", [{ ...threshold, mask: { ...ellipse, scope: "content" } }, red]),
        blue,
      ],
      { center: [1, 1, 1, 1], corner: [0, 0, 1, 1] },
    ],
    [
      "masked source layer at root",
      [{ ...red, mask: ellipse }, blue],
      { center: [1, 0, 0, 1], corner: [0, 0, 1, 1] },
    ],
    [
      "disabled mask restores",
      [{ ...red, mask: { ...ellipse, enabled: false } }, blue],
      { center: [1, 0, 0, 1], corner: [1, 0, 0, 1] },
    ],
  ]
  let samples = 0
  try {
    for (const [name, Pipeline, reverse] of [
      ["editor", EditorPipeline, reverseComposition],
      ["runtime", RuntimePipeline, reverseRuntime],
    ]) {
      const pipeline = new Pipeline(renderer, { width: N, height: N })
      pipeline.updateLogicalSize({ width: N, height: N })
      const nodesFor = (nodes) => (name === "editor" ? editorNodes(nodes) : nodes)
      const paint = async (nodes) => {
        pipeline.syncLayers(reverse(nodesFor(nodes)))
        await settle()
        let result
        if (name === "runtime") result = pipeline.renderToTexture(0, 0)
        else {
          pipeline.render(0, 0, 2)
          result = pipeline.blitInputNode.value
        }
        return read(result)
      }
      try {
        for (const [label, nodes, expected] of cases) {
          const pixels = await paint(nodes)
          const at = (x, y) => {
            const i = (index(y) * N + index(x)) * 4
            return pixels.slice(i, i + 4)
          }
          close(at(0, 0), expected.center, `${name}: ${label} (center)`, 0.02)
          close(
            at(-0.45, -0.45),
            expected.corner,
            `${name}: ${label} (corner)`,
            0.02
          )
          samples++
        }
        await paint([{ ...red, mask: ellipse }, blue])
        const pass = pipeline.passMap.get("red")
        const version = pass.getMaterialVersion()
        const moved = await paint([
          { ...red, mask: { ...ellipse, center: [0.3, 0] } },
          blue,
        ])
        assert(
          pipeline.passMap.get("red") === pass &&
            pass.getMaterialVersion() === version,
          `${name}: moving a mask rebuilt the material`
        )
        const i = (index(0) * N + index(0.3)) * 4
        close(moved.slice(i, i + 4), [1, 0, 0, 1], `${name}: moved mask`, 0.02)
        const j = (index(0) * N + index(-0.3)) * 4
        close(moved.slice(j, j + 4), [0, 0, 1, 1], `${name}: moved mask hole`, 0.02)
        await paint([{ ...red, mask: { ...ellipse, shape: "rectangle" } }, blue])
        assert(
          pass.getMaterialVersion() !== version,
          `${name}: shape change did not rebuild the material`
        )
        samples += 2
      } finally {
        pipeline.dispose()
      }
    }
  } finally {
    output.dispose()
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
  const headless = createHeadlessRenderer({
    renderer,
    size: config.composition,
  })
  const target = new THREE.RenderTarget(N, N, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, config.composition)
    headless.render(frame)
    while (compiling.length) await Promise.all(compiling.splice(0))
    material.colorNode = texture(
      headless.render(frame),
      vec2(uv().x, float(1).sub(uv().y))
    )
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    return Array.from(
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N)
    )
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
}

export async function checkLayerMasks(renderProject) {
  assert(layerMaskSignature(null) === "mask:off", "Missing mask signature")
  assert(
    layerMaskSignature(mask({ shape: "ellipse", enabled: false })) === "mask:off",
    "Disabled mask signature"
  )
  assert(
    layerMaskSignature(mask({ shape: "ellipse" })) !==
      layerMaskSignature(mask({ shape: "ellipse", center: [0.1, 0] })),
    "Center change must change the signature"
  )
  assert(normalizeLayerMask(undefined) === null, "Missing mask normalizes")
  assert(normalizeLayerMask("x") === null, "Invalid mask normalizes")
  const partial = normalizeLayerMask({ shape: "rectangle", size: [2] })
  assert(
    partial.shape === "rectangle" &&
      partial.scope === "effect" &&
      partial.enabled &&
      partial.size[0] === 2 &&
      partial.size[1] === 0.5,
    "Partial runtime mask keeps defaults"
  )
  assert(
    normalizeLayerMask({ shape: "pen" }).shape === "none",
    "Unknown shapes fall back to none"
  )
  let samples = 4
  samples += await passChecks()
  samples += await pipelineChecks()

  const brush = emptyCellPaintMask()
  paintCellSegment(brush, { x: -0.3, y: 0.2 }, { x: 0.3, y: 0.2 }, 0.1, false)
  const painted = encodeCellPaintMask(brush)
  const g = {
    ...createLayer("group"),
    id: "portrait",
    mask: mask({ shape: "ellipse", size: [0.6, 0.6], feather: 0 }),
  }
  const halftone = {
    ...createLayer("threshold"),
    id: "threshold",
    parentId: g.id,
    params: { threshold: 0.1, softness: 0.01, noise: 0 },
    mask: mask({ shape: "brush", paint: painted }),
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [g, halftone, { ...solid("red", "#ff0000"), parentId: g.id }, solid("blue", "#0000ff")],
    selectedLayerId: halftone.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  assert(
    store().getLayerById(g.id).mask.shape === "ellipse" &&
      store().getLayerById(halftone.id).mask.paint === painted,
    "Hydration lost layer masks"
  )
  assert(
    store().getLayerById("blue").mask === undefined,
    "Unmasked layers must not gain a mask on hydration"
  )
  const before = buildEditorHistorySnapshot()
  store().setLayerMask(g.id, { shape: "rectangle", center: [0.2, 0.1] })
  store().setLayerMask(halftone.id, { paint: "" })
  assert(
    store().getLayerById(g.id).mask.shape === "rectangle" &&
      store().getLayerById(g.id).mask.size[0] === 0.6,
    "setLayerMask must merge with existing values"
  )
  applyEditorHistorySnapshot(before)
  assert(
    store().getLayerById(g.id).mask.shape === "ellipse" &&
      store().getLayerById(halftone.id).mask.paint === painted,
    "History lost masks"
  )
  store().setLayerMask("blue", { shape: "radial" })
  const blueMask = store().getLayerById("blue").mask
  assert(
    blueMask.shape === "radial" && blueMask.scope === "effect" && blueMask.enabled,
    "New masks start from defaults"
  )
  applyEditorHistorySnapshot(before)
  const duplicateId = store().duplicateLayer(halftone.id)
  const duplicate = store().getLayerById(duplicateId)
  assert(
    duplicate.mask.paint === painted && duplicate.mask !== store().getLayerById(halftone.id).mask,
    "Duplicate must copy the mask independently"
  )
  applyEditorHistorySnapshot(before)

  const paint = useCellPaintStore.getState()
  assert(
    !canPaintMaskLayer(store().layers, g.id, g.id),
    "Ellipse masks are not brush-editable"
  )
  assert(
    canPaintMaskLayer(store().layers, halftone.id, halftone.id),
    "Brush mask on the selected layer is editable"
  )
  paint.edit(halftone.id, "mask")
  useCellPaintStore.getState().setDraft("")
  const preview = withCellPaintPreview(store().layers, halftone.id)
  assert(
    preview.find((l) => l.id === halftone.id).mask.paint === "" &&
      store().getLayerById(halftone.id).mask.paint === painted &&
      preview.find((l) => l.id === halftone.id).params._paintGuide === undefined,
    "Mask draft preview must not touch the store or Cells guide"
  )
  paint.edit(null)
  samples += 6

  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const reopened = buildLabProjectFile()
  assert(
    JSON.stringify(reopened.layers.map((l) => l.mask ?? null)) ===
      JSON.stringify(saved.layers.map((l) => l.mask ?? null)),
    "Save/reopen changed masks"
  )
  const config = buildShaderExportConfig(reopened)
  assert(
    config.layers.find((l) => l.id === g.id).mask.shape === "ellipse" &&
      config.layers.find((l) => l.id === halftone.id).mask.paint === painted &&
      !("mask" in config.layers.find((l) => l.id === "blue")),
    "Shader export lost masks"
  )
  const runtimeTree = runtimeFrame(config, 0, 0, 1, config.composition)
  assert(
    runtimeTree.layers.find((n) => n.id === g.id)?.mask?.shape === "ellipse",
    "Runtime group node lost its mask"
  )
  samples += 3

  const first = await renderProject(saved)
  const at = (image, x, y) => {
    const i = (index(y) * N + index(x)) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  close(at(first.image, 0, 0), [255, 0, 0, 255], "Editor group interior", 2)
  close(at(first.image, -0.45, -0.45), [0, 0, 255, 255], "Editor group cutout", 2)
  const rowA = at(first.image, 0, 0.2)
  const rowB = at(first.image, 0, -0.2)
  assert(
    [rowA, rowB].some((p) => p[0] > 250 && p[1] > 250) &&
      [rowA, rowB].some((p) => p[0] > 250 && p[1] < 5),
    "Brush-limited threshold must whiten one stroke row only"
  )
  const restored = await renderProject(reopened)
  close(
    Array.from(restored.image.data),
    Array.from(first.image.data),
    "Reopened mask pixels",
    0
  )
  const runtimePixels = await runtimeRender(config)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      if (i % 4 === 3) return v
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }),
    "Exported runtime mask parity",
    0.02
  )
  samples += 4
  return { samples, png: first.png }
}
