import { PatternPass as RuntimePattern } from "@runtime/renderer/pattern-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { PatternPass } from "@/renderer/pattern-pass"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import { MAX_PATTERN_MOTIFS } from "@/lib/editor/pattern-motifs"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  collectReferencedAssetIds,
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
const RED = "/scenes/default/motif-red.svg"
const GREEN = "/scenes/default/motif-green.svg"
const BLUE_HALF = "/scenes/default/motif-blue-half.svg"
const CELL = 4
const CELLS = 16
const W = CELL * CELLS
const H = CELL

function unitChecks() {
  const params = getLayerDefinition("pattern").params
  const preset = params.find((p) => p.key === "preset")
  const colorMode = params.find((p) => p.key === "colorMode")
  assert(preset.options.some((o) => o.value === "custom"), "Preset offers Custom")
  assert(
    colorMode.options.some((o) => o.value === "original" && o.label === "Motif colors"),
    "Color Mode offers Motif colors"
  )
  const layer = createLayer("pattern")
  assert(
    layer.params.preset === "bars" && layer.params.colorMode === "source",
    "New Pattern layers keep the Bars preset and Source colors"
  )
  assert(layer.patternAssetIds === undefined, "New Pattern layers have no motifs")
  assert(MAX_PATTERN_MOTIFS === 10, "Motif limit")
  return 5
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const ramp = new Float32Array(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const tone = linear((Math.floor(x / CELL) + 0.5) / CELLS)
      ramp.set([tone, tone, tone, 1], (y * W + x) * 4)
    }
  const input = new THREE.DataTexture(ramp, W, H, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", PatternPass],
      ["runtime", RuntimePattern],
    ]) {
      const pass = new Pass(`pattern-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      pass.resize(W, H)
      pass.updateLogicalSize(W, H)
      const render = async (params, motifs = [RED, GREEN, BLUE_HALF]) => {
        pass.updateParams({
          ...createLayer("pattern").params,
          preset: "custom",
          cellSize: CELL,
          colorMode: "original",
          ...params,
        })
        await pass.setMotifs(motifs)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
        return (cell, column) => {
          const i = ((1 * W) + cell * CELL + column) * 4
          return pixels.slice(i, i + 4).map((v) => Math.round(v * 1000) / 1000)
        }
      }
      const check = (label, actual, expected, tolerance = 0.01) => {
        close(actual, expected, `${name}: ${label}`, tolerance)
        results[label] ??= {}
        results[label][name] = actual
        samples++
      }

      let at = await render({})
      check("lightest tones take the first motif", at(15, 2), [1, 0, 0, 1])
      check("light boundary stays on the first motif", at(11, 2), [1, 0, 0, 1])
      check("middle tones take the second motif", at(8, 2), [0, 1, 0, 1])
      check("middle boundary stays on the second motif", at(5, 2), [0, 1, 0, 1])
      check("darkest tones take the last motif", at(0, 3), [0, 0, 1, 1])
      check("transparent motif pixels show the background", at(0, 0), [0, 0, 0, 1])

      at = await render({ bgOpacity: 1 })
      const darkTone = linear(0.5 / CELLS)
      check("background shows the source behind motifs", at(0, 0), [darkTone, darkTone, darkTone, 1])

      at = await render({ invert: true })
      check("invert gives dark tones the first motif", at(0, 2), [1, 0, 0, 1])
      check("invert gives light tones the last motif", at(15, 3), [0, 0, 1, 1])

      at = await render({ colorMode: "monochrome", monoColor: "#ffffff" })
      const ink = at(15, 2)
      assert(ink[0] > 0.5 && ink[0] === ink[1] && ink[1] === ink[2], `${name}: monochrome inks the motif shape, got ${ink}`)
      check("ink modes use motif alpha as the shape", at(0, 0), [0, 0, 0, 1])
      samples++

      at = await render({}, [GREEN, RED, BLUE_HALF])
      check("reordering changes which motif covers the light tones", at(15, 2), [0, 1, 0, 1])

      at = await render({}, [])
      const passthrough = at(8, 2)
      const middle = linear(8.5 / CELLS)
      check("no motifs leaves the input unchanged", passthrough, [middle, middle, middle, 1], 0.002)

      assert(pass.getMotifCount() === 0, `${name}: motif count after clearing`)
      await pass.setMotifs([RED, "data:image/svg+xml,not-an-image"]).then(
        () => {
          throw new Error(`${name}: a missing motif must reject`)
        },
        (error) => assert(error.failed === 1, `${name}: reports one failed motif`)
      )
      assert(pass.getMotifCount() === 1, `${name}: a failed motif keeps the rest`)
      samples += 2
      pass.dispose()
    }
    for (const [label, pair] of Object.entries(results))
      close(pair.editor, pair.runtime, `editor/runtime parity: ${label}`, 0.002)
  } finally {
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
}

async function runtimeRender(config, size) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const compiling = []
  const compile = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const pending = compile(...args)
    compiling.push(pending)
    return pending
  }
  const headless = createHeadlessRenderer({ renderer, size })
  const target = new THREE.RenderTarget(size.width, size.height, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const read = async (frame) => {
    material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
    material.needsUpdate = true
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, size.width, size.height))
  }
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, size)
    let previous = null
    for (let attempt = 0; attempt < 40; attempt++) {
      headless.render(frame)
      while (compiling.length) await Promise.all(compiling.splice(0))
      await new Promise((resolve) => setTimeout(resolve, 100))
      const pixels = await read(frame)
      if (previous && pixels.every((value, i) => value === previous[i]) && attempt > 4) return pixels
      previous = pixels
    }
    return previous
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
}

function motifAsset(id, fileName, url) {
  return { id, kind: "image", url, fileName, width: 100, height: 100 }
}

export async function checkPatternMotifs(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const size = { width: 96, height: 64 }
  const photo = motifAsset("photo", "slice.webp", "/scenes/default/rings-photo.webp")
  photo.width = 1512
  photo.height = 908
  const motifs = [
    motifAsset("motif-red", "apple.svg", RED),
    motifAsset("motif-green", "apple.svg", GREEN),
    motifAsset("motif-blue", "rotten.svg", BLUE_HALF),
  ]
  const pattern = {
    ...createLayer("pattern"),
    id: "motifs",
    params: { ...createLayer("pattern").params, preset: "custom", cellSize: 8, colorMode: "original" },
    patternAssetIds: motifs.map((motif) => motif.id),
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [photo, ...motifs],
    layers: [pattern, { ...createLayer("image"), id: "photo-layer", assetId: photo.id }],
    selectedLayerId: pattern.id,
    composition: size,
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }

  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  assert(
    store().getLayerById(pattern.id).patternAssetIds.join() === motifs.map((m) => m.id).join(),
    "Hydration keeps the motif order"
  )
  const referenced = collectReferencedAssetIds({ audioSource: null, layers: store().layers })
  assert(motifs.every((motif) => referenced.has(motif.id)), "Motifs count as referenced assets")
  const before = buildEditorHistorySnapshot()
  store().setLayerPatternAssets(pattern.id, ["motif-blue", "motif-red", "motif-green"])
  assert(store().getLayerById(pattern.id).patternAssetIds[0] === "motif-blue", "Reorder reaches the store")
  applyEditorHistorySnapshot(before)
  assert(store().getLayerById(pattern.id).patternAssetIds[0] === "motif-red", "Undo restores the motif order")
  const duplicateId = store().duplicateLayer(pattern.id)
  assert(
    store().getLayerById(duplicateId).patternAssetIds !== store().getLayerById(pattern.id).patternAssetIds,
    "Duplicates own their motif list"
  )
  store().setLayerPatternAssets(duplicateId, ["motif-green"])
  assert(store().getLayerById(pattern.id).patternAssetIds.length === 3, "Editing a duplicate leaves the original")
  applyEditorHistorySnapshot(before)
  samples += 6

  const saved = buildLabProjectFile()
  assert(
    motifs.every((motif) => saved.assets.some((asset) => asset.id === motif.id)),
    "Saved files keep every motif asset"
  )
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  assert(
    reopened.layers.find((l) => l.id === pattern.id).patternAssetIds.join() === motifs.map((m) => m.id).join(),
    "Save/reopen keeps the motif order"
  )

  const missing = {
    ...JSON.parse(JSON.stringify(saved)),
    assets: saved.assets.map((asset) =>
      asset.id === "motif-blue" ? { id: asset.id, kind: "image", fileName: "rotten.svg" } : asset
    ),
  }
  store().replaceState([])
  const result = applyLabProjectFile(parseLabProjectFileValue(missing), [])
  const missingLayer = store().getLayerById(pattern.id)
  assert(
    missingLayer.patternAssetIds.join() === "motif-red,motif-green" &&
      missingLayer.runtimeError === "Missing motif: rotten.svg" &&
      result.missingAssetCount === 1,
    `A missing motif is dropped and reported, got ${JSON.stringify([missingLayer.patternAssetIds, missingLayer.runtimeError, result])}`
  )
  samples += 3

  const config = buildShaderExportConfig(reopened)
  const exported = config.layers.find((l) => l.id === pattern.id)
  assert(
    exported.patternAssets.length === 3 &&
      new Set(exported.patternAssets.map((m) => m.src)).size === 3 &&
      exported.patternAssets.every((m) => m.kind === "image" && m.src.startsWith("/replace/image/")),
    `Shader export lists each motif with a distinct placeholder, got ${JSON.stringify(exported.patternAssets)}`
  )
  samples++

  const first = await renderProject(saved)
  const counts = { red: 0, green: 0, blue: 0 }
  for (let i = 0; i < first.image.data.length; i += 4) {
    const [r, g, b] = first.image.data.slice(i, i + 3)
    if (r > 240 && g < 15 && b < 15) counts.red++
    if (g > 240 && r < 15 && b < 15) counts.green++
    if (b > 240 && r < 15 && g < 15) counts.blue++
  }
  assert(
    counts.red > 0 && counts.green > 0,
    `Motifs keep their own colors on the photo, got ${JSON.stringify(counts)}`
  )
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)

  const runtimeConfig = {
    ...config,
    layers: config.layers.map((layer) => {
      if (layer.id === pattern.id)
        return { ...layer, patternAssets: [RED, GREEN, BLUE_HALF].map((src) => ({ kind: "image", src })) }
      if (layer.asset) return { ...layer, asset: { ...layer.asset, src: photo.url } }
      return layer
    }),
  }
  const runtimePixels = await runtimeRender(runtimeConfig, size)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime pattern motif parity",
    0.02
  )
  samples += 3
  return { samples, counts, png: first.png }
}
