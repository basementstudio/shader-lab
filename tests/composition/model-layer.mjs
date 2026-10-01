import { float, texture, uv, vec2 } from "three/tsl"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import { getLayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import {
  MODEL_ENVIRONMENTS,
  modelMaterialDefaults,
} from "@/lib/editor/config/model-options"
import {
  eulerToQuaternion,
  readModelFraming,
  rotateAboutAxis,
  trackballRotation,
} from "@/lib/editor/model-framing"
import { inferFileAssetKind } from "@/lib/editor/media-file"
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
import { buildRendererFrame } from "@/renderer/contracts"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
import { ModelPass } from "@/renderer/model-pass"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
function near(actual, expected, tolerance, label) {
  assert(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: got ${actual}, expected ${expected} ± ${tolerance}`
  )
}
const N = 96
const RED = [1, 0, 0]
const BLUE = [0, 0, 1]

export async function exportGlb(build) {
  const scene = new THREE.Scene()
  build(scene)
  const buffer = await new GLTFExporter().parseAsync(scene, { binary: true })
  return new Blob([buffer], { type: "model/gltf-binary" })
}

export function studyScene(scene) {
  const white = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.4 })
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 48, 128), white)
  torus.position.set(0, 0.35, 0)
  torus.rotation.set(0.5, 0.3, 0)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 64, 32), white)
  sphere.position.set(-0.75, -0.55, 0.4)
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 64), white)
  cylinder.position.set(0.7, -0.5, -0.3)
  cylinder.rotation.set(0.2, 0, 0.9)
  scene.add(torus, sphere, cylinder)
}

function unlitBar(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0) })
    )
  )
}

function unlitGray(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.5, 0.5, 0.5, THREE.LinearSRGBColorSpace) })
    )
  )
}

function unlitRedSphere(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0) })
    )
  )
}

function unlitSphere(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) })
    )
  )
}

function whiteSphere(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0 })
    )
  )
}

function transmissiveSphere(scene) {
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.1, transmission: 1, thickness: 0.5 })
    )
  )
}

export function assetFor(blob, id, fileName = `${id}.glb`, kind = "model") {
  return {
    createdAt: new Date(0).toISOString(),
    duration: null,
    error: null,
    fileName,
    height: null,
    id,
    kind,
    mimeType: kind === "model" ? "model/gltf-binary" : "image/vnd.radiance",
    sizeBytes: blob.size,
    source: "local",
    status: "ready",
    url: URL.createObjectURL(blob),
    width: null,
  }
}

export function modelLayer(assetId, params = {}, extra = {}) {
  const layer = createLayer("model")
  return {
    ...layer,
    id: extra.id ?? "model",
    assetId,
    params: { ...layer.params, ...params },
    ...extra,
  }
}

function timeline(time = 0) {
  return {
    currentTime: time,
    duration: 4,
    isPlaying: false,
    loop: true,
    selectedKeyframeId: null,
    selectedKeyframeIds: [],
    selectedTrackId: null,
    tracks: [],
  }
}

function frameFor(layers, assets, size, options = {}) {
  return buildRendererFrame({
    assets,
    layers,
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: options.background ?? "#f5c400" },
    timeline: timeline(options.time ?? 0),
    clockTime: options.time ?? 0,
    outputSize: size,
    viewportSize: size,
    delta: 0,
    pixelRatio: 1,
  })
}

async function settle(renderer, frame) {
  renderer.render(frame)
  const deadline = performance.now() + 60_000
  while (renderer.hasPendingResources()) {
    if (performance.now() > deadline) throw new Error("Timed out loading the model")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  renderer.render(frame)
  renderer.render(frame)
  await renderer.waitForGpuIdle()
}

export async function renderLayers(layers, assets, size, options = {}) {
  const canvas = document.createElement("canvas")
  const renderer = await createWebGPURenderer(canvas, { strictPassFailures: true })
  try {
    await renderer.initialize()
    renderer.resize(size, 1)
    const frame = frameFor(layers, assets, size, options)
    await settle(renderer, frame)
    return renderer.exportFrame(frame, size).toDataURL("image/png")
  } finally {
    renderer.dispose()
    await renderer.destroyDevice()
  }
}

function canvasPixels(canvas) {
  const copy = document.createElement("canvas")
  copy.width = canvas.width
  copy.height = canvas.height
  const context = copy.getContext("2d", { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  return context.getImageData(0, 0, copy.width, copy.height)
}

function encodeHdr(width, height, rgb) {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`
  const bytes = new Uint8Array(header.length + width * height * 4)
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i)
  const max = Math.max(...rgb)
  const exponent = Math.ceil(Math.log2(max)) + 1
  const scale = 256 / 2 ** exponent
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = header.length + pixel * 4
    bytes[offset] = Math.round(rgb[0] * scale)
    bytes[offset + 1] = Math.round(rgb[1] * scale)
    bytes[offset + 2] = Math.round(rgb[2] * scale)
    bytes[offset + 3] = exponent + 128
  }
  return new Blob([bytes])
}

function unitChecks() {
  const entry = getLayerCatalogEntry("model")
  assert(entry.label === "3D Model" && entry.description, "Catalog entry")
  const layer = createLayer("model")
  assert(layer.kind === "model" && layer.type === "model", "Model layer kind")
  assert(layer.params.material === "original" && layer.params.environment === "studio", "Default material and studio")
  const framing = readModelFraming(layer.params)
  assert(
    framing.location.every((value) => value === 0) &&
      framing.rotation.every((value) => value === 0) &&
      framing.scale.every((value) => value === 1),
    "Default transform"
  )
  assert(MODEL_ENVIRONMENTS.length === 5, "Five bundled studios")
  assert(modelMaterialDefaults("rubber")?.color === "#1b1b1b", "Rubber preset color")
  assert(modelMaterialDefaults("original") === null, "Original keeps file materials")
  const turned = rotateAboutAxis([0, 0, 0], new THREE.Vector3(0, 1, 0), Math.PI / 2)
  near(turned[1], 90, 0.2, "Rotating about world Y writes Y")
  const composed = eulerToQuaternion(rotateAboutAxis([0, 90, 0], new THREE.Vector3(1, 0, 0), Math.PI / 2))
  const expected = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  near(Math.abs(composed.dot(expected)), 1, 1e-3, "World-axis rotations compose in world space")
  const basis = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }
  near(trackballRotation([0, 0, 0], 100, 0, 200, basis)[1], 90, 0.2, "Horizontal trackball turns around the view up axis")
  near(trackballRotation([0, 0, 0], 0, 100, 200, basis)[0], 90, 0.2, "Vertical trackball tilts around the view right axis")
  const file = (name, type = "") => new File([new Uint8Array(4)], name, { type })
  assert(inferFileAssetKind(file("model.glb")) === "model", ".glb is a model")
  assert(inferFileAssetKind(file("scene.gltf")) === "model", ".gltf is a model")
  assert(inferFileAssetKind(file("studio.hdr")) === "environment", ".hdr is an environment")
  assert(inferFileAssetKind(file("studio.hdr", "image/vnd.radiance")) === "environment", "Radiance MIME is an environment")
  assert(inferFileAssetKind(file("mesh.obj")) === null, "OBJ is not accepted")
  return 15
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(new Float32Array([0, 0, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const incomingDepth = new THREE.DataTexture(new Float32Array([0.25, 0.25, 0.25, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  incomingDepth.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const urls = {
    bar: URL.createObjectURL(await exportGlb(unlitBar)),
    gray: URL.createObjectURL(await exportGlb(unlitGray)),
    sphere: URL.createObjectURL(await exportGlb(unlitSphere)),
    lit: URL.createObjectURL(await exportGlb(whiteSphere)),
    transmissive: URL.createObjectURL(await exportGlb(transmissiveSphere)),
  }
  const pass = new ModelPass("model-check", renderer)
  pass.updateCompositionRole("source")
  pass.flushColorNode()
  pass.resize(N, N)
  pass.updateLogicalSize(N, N)
  pass.updateOpacity(1)
  let samples = 0
  const read = async (renderTarget = target) =>
    Array.from(await renderer.readRenderTargetPixelsAsync(renderTarget, 0, 0, N, N))
  const sample = (pixels, x, y) => {
    const column = Math.min(N - 1, Math.max(0, Math.round((x + 0.5) * N - 0.5)))
    const row = Math.min(N - 1, Math.max(0, Math.round((0.5 - y) * N - 0.5)))
    const i = (row * N + column) * 4
    return pixels.slice(i, i + 4)
  }
  const render = async (url, params = {}, blend = "normal") => {
    pass.updateBlendMode(blend)
    pass.flushColorNode()
    pass.updateParams({
      ...createLayer("model").params,
      floor: false,
      orbit: 0,
      elevation: 0,
      toneMapping: "none",
      ...params,
    })
    await pass.setEnvironment(MODEL_ENVIRONMENTS[0].url)
    await pass.setModel({ url })
    await pass.whenCompiled()
    pass.render(renderer, input, target, 0, 0)
    pass.render(renderer, input, target, 0, 0)
    return read()
  }
  const isColor = (pixel, color, label) => {
    for (let channel = 0; channel < 3; channel++) near(pixel[channel], color[channel], 0.03, `${label} [${channel}]`)
    samples++
  }
  try {
    let pixels = await render(urls.bar)
    isColor(sample(pixels, 0, 0), RED, "Model covers the center")
    isColor(sample(pixels, 0.4, 0), RED, "Fitted bar reaches toward the frame edge")
    isColor(sample(pixels, 0, 0.3), BLUE, "Layers below show around the model")
    near(sample(pixels, 0, 0.3)[3], 1, 0.01, "Backdrop alpha preserved")
    samples++

    pixels = await render(urls.bar, { rotation: [0, 0, 90] })
    isColor(sample(pixels, 0, 0.38), RED, "Rotating Z turns the bar upright")
    isColor(sample(pixels, 0.3, 0), BLUE, "Upright bar leaves the sides clear")

    pixels = await render(urls.bar, { scale: [0.5, 0.5, 0.5] })
    isColor(sample(pixels, 0.12, 0), RED, "Half scale keeps the core")
    isColor(sample(pixels, 0.36, 0), BLUE, "Half scale shrinks the silhouette")

    pixels = await render(urls.bar, { scale: [1, 2.4, 1] })
    isColor(sample(pixels, 0, 0.2), RED, "Scale Y stretches only the height")

    pixels = await render(urls.bar, { scale: [0.5, 0.5, 0.5], shift: [0.25, 0] })
    isColor(sample(pixels, 0.36, 0), RED, "Camera shift slides the model right")
    isColor(sample(pixels, -0.12, 0), BLUE, "Camera shift clears the old left side")

    pixels = await render(urls.bar, { scale: [0.5, 0.5, 0.5], location: [0.5, 0, 0] })
    isColor(sample(pixels, 0.36, 0), RED, "Location X moves the model right")
    isColor(sample(pixels, -0.12, 0), BLUE, "Location X clears the old left side")

    pixels = await render(urls.bar, { scale: [0.5, 0.5, 0.5], location: [0, 0.6, 0] })
    isColor(sample(pixels, 0, 0.27), RED, "Location Y raises the model")
    isColor(sample(pixels, 0, 0), BLUE, "Location Y lifts the model off the center")

    pixels = await render(urls.bar, {}, "multiply")
    isColor(sample(pixels, 0, 0), [0, 0, 0], "Multiply red over blue is black")
    isColor(sample(pixels, 0, 0.3), BLUE, "Multiply leaves uncovered pixels")

    pass.updateOpacity(0.5)
    pixels = await render(urls.bar)
    isColor(sample(pixels, 0, 0), [0.5, 0, 0.5], "Half opacity mixes with the layers below")
    pass.updateOpacity(1)

    pixels = await render(urls.gray)
    isColor(sample(pixels, 0, 0), [0.5, 0.5, 0.5], "No tone mapping keeps linear color")
    pixels = await render(urls.gray, { exposure: 1 })
    isColor(sample(pixels, 0, 0), [1, 1, 1], "Exposure +1 doubles light")
    pixels = await render(urls.gray, { toneMapping: "neutral" })
    near(sample(pixels, 0, 0)[0], 0.46, 0.02, "Neutral tone mapping offsets mid gray")
    samples++

    const lit = await render(urls.lit, { orbit: 30, elevation: 15, toneMapping: "neutral" })
    const litCenter = sample(lit, 0, 0)
    assert(litCenter[0] > 0.2 && litCenter[0] < 0.99, `Studio lights a white sphere with shading (${litCenter})`)
    samples++
    const chrome = await render(urls.lit, { orbit: 30, elevation: 15, toneMapping: "neutral", material: "chrome", materialColor: "#ffffff", materialRoughness: 0.04 })
    const rubber = await render(urls.lit, { orbit: 30, elevation: 15, toneMapping: "neutral", material: "rubber", materialColor: "#1b1b1b", materialRoughness: 0.55 })
    const meanDelta = (a, b) => {
      let total = 0
      for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      return total / ((a.length / 4) * 3)
    }
    const chromeDelta = meanDelta(chrome, lit)
    assert(chromeDelta > 0.02, `Chrome replaces the file material (${chromeDelta})`)
    assert(sample(rubber, 0, 0)[0] < litCenter[0] * 0.5, "Rubber darkens the model")
    const restored = await render(urls.lit, { orbit: 30, elevation: 15, toneMapping: "neutral", material: "original" })
    let restoreDelta = 0
    for (let i = 0; i < lit.length; i++) restoreDelta = Math.max(restoreDelta, Math.abs(lit[i] - restored[i]))
    assert(restoreDelta < 0.004, `Original restores the file materials exactly (${restoreDelta})`)
    samples += 3
    for (const material of ["brushed-metal", "glass", "clay", "iridescent"]) {
      const defaults = modelMaterialDefaults(material)
      const shaded = await render(urls.lit, { orbit: 30, elevation: 15, toneMapping: "neutral", material, materialColor: defaults.color, materialRoughness: defaults.roughness })
      assert(shaded.every(Number.isFinite), `${material} renders finite pixels`)
      samples++
    }

    const transmissive = await render(urls.transmissive, { orbit: 30, elevation: 15, toneMapping: "neutral", material: "original" })
    assert(transmissive.every(Number.isFinite), "An imported transmissive material compiles and renders finite pixels")
    assert(sample(transmissive, 0, 0)[3] > 0.99, "An imported transmissive model still covers its silhouette")
    samples += 2

    await render(urls.sphere)
    pass.setSceneDepth(incomingDepth)
    pass.render(renderer, input, target, 0, 0)
    const sceneDepth = pass.getOutputSceneDepth()
    assert(sceneDepth && sceneDepth !== incomingDepth, "The model exposes its own scene depth")
    const probe = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
    probe.colorNode = texture(sceneDepth, vec2(uv().x, float(1).sub(uv().y)))
    const probeScene = new THREE.Scene()
    probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probe))
    renderer.setRenderTarget(target)
    renderer.render(probeScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    const depth = await read()
    probe.dispose()
    const centerDepth = sample(depth, 0, 0)[0]
    const rimDepth = sample(depth, 0.38, 0)[0]
    const outsideDepth = sample(depth, 0.49, 0.49)[0]
    assert(centerDepth > 0.9, `Nearest point of the sphere is near white (${centerDepth})`)
    assert(rimDepth < centerDepth - 0.1 && rimDepth > 0.3, `The rim is farther than the center (${rimDepth})`)
    near(outsideDepth, 0.25, 0.02, "Outside the model the incoming scene depth passes through")
    near(sample(depth, 0, 0)[3], 1, 0.01, "Depth alpha marks the model")
    samples += 5
    pass.setSceneDepth(null)

    const hdrUrl = URL.createObjectURL(encodeHdr(64, 32, [3, 0.2, 0.2]))
    pass.updateParams({ ...createLayer("model").params, floor: false, orbit: 0, elevation: 0, lightIntensity: 0, toneMapping: "none" })
    await pass.setEnvironment(hdrUrl)
    await pass.setModel({ url: urls.lit })
    pass.render(renderer, input, target, 0, 0)
    pass.render(renderer, input, target, 0, 0)
    const redStudio = sample(await read(), 0, 0)
    assert(redStudio[0] > redStudio[1] * 3 && redStudio[0] > 0.2, `A custom red .hdr lights the model red (${redStudio})`)
    await pass.setEnvironment(URL.createObjectURL(encodeHdr(64, 32, [5, 5, 5])))
    pass.render(renderer, input, target, 0, 0)
    pass.render(renderer, input, target, 0, 0)
    const grayStudio = sample(await read(), 0, 0)
    near(grayStudio[0], 0.6, 0.08, "A bright custom .hdr is normalized to the studio exposure")
    near(grayStudio[0], grayStudio[2], 0.02, "Swapping the studio relights without a stale tint")
    samples += 3

    pass.clearModel()
    pass.render(renderer, input, target, 0, 0)
    isColor(sample(await read(), 0, 0), BLUE, "Clearing the model leaves the layers below")
    assert(pass.getOutputSceneDepth() === null, "Without a model the scene depth passes through")
    samples++
    assert(!pass.needsContinuousRender(), "A still model does not render continuously")
    await pass.setModel({ url: urls.bar })
    pass.updateParams({ ...createLayer("model").params, spin: 45 })
    assert(pass.needsContinuousRender(), "Spin renders continuously")
    samples += 2
  } finally {
    pass.dispose()
    target.dispose()
    input.dispose()
    incomingDepth.dispose()
    renderer.dispose()
  }
  return samples
}

async function pipelineChecks() {
  const size = { width: N, height: N }
  const bar = assetFor(await exportGlb(unlitBar), "bar")
  const redSphere = assetFor(await exportGlb(unlitRedSphere), "red-sphere")
  const study = assetFor(await exportGlb(studyScene), "study")
  const canvas = document.createElement("canvas")
  const renderer = await createWebGPURenderer(canvas, { strictPassFailures: true })
  let samples = 0
  const renderAt = async (layers, assets) => {
    const frame = frameFor(layers, assets, size, { background: "#000000" })
    await settle(renderer, frame)
    const preview = canvasPixels(canvas)
    const exported = canvasPixels(renderer.exportFrame(frame, size))
    let mismatch = 0
    for (let i = 0; i < preview.data.length; i++) if (preview.data[i] !== exported.data[i]) mismatch++
    assert(mismatch === 0, `Preview and export match (${mismatch} channels differ)`)
    samples++
    return (x, y) => {
      const column = Math.round((x + 0.5) * (N - 1))
      const row = Math.round((0.5 - y) * (N - 1))
      const i = (row * N + column) * 4
      return Array.from(preview.data.slice(i, i + 3), (value) => value / 255)
    }
  }
  const ramp = JSON.stringify([
    { position: 0, color: "#000000" },
    { position: 1, color: "#ffffff" },
  ])
  const gradientMap = (params = {}, extra = {}) => {
    const layer = createLayer("gradient-map")
    return { ...layer, id: "map", params: { ...layer.params, stops: ramp, ...params }, ...extra }
  }
  try {
    await renderer.initialize()
    renderer.resize(size, 1)
    const flat = { floor: false, orbit: 0, elevation: 0, toneMapping: "none" }
    const byDepth = await renderAt([gradientMap({ input: "depth" }), modelLayer(bar.id, flat)], [bar])
    const nearTone = byDepth(0, 0)[0]
    const outsideTone = byDepth(0, 0.35)[0]
    assert(nearTone > 0.5 && outsideTone < 0.05, `Effects read the model's depth (${nearTone}, ${outsideTone})`)
    samples++
    const masked = await renderAt(
      [
        gradientMap({ input: "luminance" }, { mask: { shape: "depth", scope: "effect", enabled: true, invert: false, center: [0, 0], size: [0.9, 1], rotation: 0, feather: 0.01, paint: "" } }),
        modelLayer(redSphere.id, flat),
      ],
      [redSphere]
    )
    const inBand = masked(0, 0)
    const outOfBand = masked(0.38, 0)
    assert(Math.abs(inBand[0] - inBand[2]) < 0.05, `A depth mask band recolors the nearest part (${inBand})`)
    assert(outOfBand[0] > outOfBand[2] + 0.2, `Farther parts outside the band keep their color (${outOfBand})`)
    samples += 2
    const group = { ...createLayer("group"), id: "group" }
    const grouped = await renderAt(
      [gradientMap({ input: "depth" }), group, { ...modelLayer(bar.id, flat), parentId: "group" }],
      [bar]
    )
    near(grouped(0, 0)[0], nearTone, 0.03, "Scene depth leaves a group that holds the model")
    samples++

    const pose = (rotation) => modelLayer(study.id, { rotation, material: "original" })
    const first = await renderAt([pose([0, 0, 19.4])], [study])
    const control = await renderAt([pose([0, 0, 19.4])], [study])
    let controlDelta = 0
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4])
      for (const y of [-0.4, -0.2, 0, 0.2, 0.4])
        for (let channel = 0; channel < 3; channel++)
          controlDelta = Math.max(controlDelta, Math.abs(first(x, y)[channel] - control(x, y)[channel]))
    assert(controlDelta < 0.005, `Rendering the same pose twice is deterministic (${controlDelta})`)
    samples++
    const frameA = frameFor([pose([0, 0, 19.4])], [study], size)
    const frameB = frameFor([pose([0, 0, -160.6])], [study], size)
    renderer.render(frameB)
    for (let i = 0; i < 12; i++) renderer.render(frameB)
    for (let i = 0; i < 12; i++) renderer.render(frameA)
    await renderer.waitForGpuIdle()
    const back = await renderAt([pose([0, 0, 19.4])], [study])
    let poseDelta = 0
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4])
      for (const y of [-0.4, -0.2, 0, 0.2, 0.4])
        for (let channel = 0; channel < 3; channel++)
          poseDelta = Math.max(poseDelta, Math.abs(first(x, y)[channel] - back(x, y)[channel]))
    assert(poseDelta < 0.01, `Returning to a pose redraws every mesh and its shadows (${poseDelta})`)
    samples++
  } finally {
    renderer.dispose()
    await renderer.destroyDevice()
  }
  return samples
}

function projectChecks() {
  const model = { ...modelLayer("glb"), id: "model", environmentAssetId: "hdr", params: { ...createLayer("model").params, rotation: [0, 30, 0], environment: "custom" } }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [
      { id: "glb", fileName: "chair.glb", kind: "model" },
      { id: "hdr", fileName: "loft.hdr", kind: "environment" },
    ],
    layers: [model],
    selectedLayerId: model.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  const referenced = collectReferencedAssetIds({ audioSource: null, layers: [model] })
  assert(referenced.has("glb") && referenced.has("hdr"), "Model and environment assets are referenced")
  const missing = applyLabProjectFile(parseLabProjectFileValue(project), [])
  const hydrated = useLayerStore.getState().getLayerById(model.id)
  assert(missing.missingAssetCount === 1 && hydrated.runtimeError === "Missing asset: chair.glb", "Missing model is reported")
  assert(hydrated.environmentAssetId === "hdr", "A missing environment stays linked on import")
  const withModel = { ...project, layers: [{ ...model, assetId: null }] }
  applyLabProjectFile(parseLabProjectFileValue(withModel), [])
  const environmentMissing = useLayerStore.getState().getLayerById(model.id)
  assert(environmentMissing.runtimeError === "Missing environment: loft.hdr", "Missing environment is reported")
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  store().updateLayerParam(model.id, "rotation", [10, 20, 30])
  store().updateLayerParam(model.id, "location", [1, 0, 0])
  applyEditorHistorySnapshot(before)
  assert(store().getLayerById(model.id).params.rotation[1] === 30, "History restores the model transform")
  const duplicateId = store().duplicateLayer(model.id)
  store().updateLayerParam(duplicateId, "scale", [2, 2, 2])
  assert(store().getLayerById(model.id).params.scale[0] === 1, "Duplicates are independent")
  const saved = buildLabProjectFile()
  const reopened = parseLabProjectFileValue(JSON.parse(JSON.stringify(saved)))
  const reopenedModel = reopened.layers.find((layer) => layer.id === model.id)
  assert(reopenedModel.type === "model" && reopenedModel.params.rotation[1] === 30, "Save/reopen keeps the model layer")
  let exportError = ""
  try {
    buildShaderExportConfig({ ...reopened, assets: [] })
  } catch (error) {
    exportError = error instanceof Error ? error.message : String(error)
  }
  assert(exportError.includes("not supported by shader export yet"), `Shader export reports 3D as unsupported (${exportError})`)
  return 9
}

async function largeTargetChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const input = new THREE.DataTexture(new Float32Array([0, 0, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const url = URL.createObjectURL(await exportGlb(unlitBar))
  let samples = 0
  try {
    for (const size of [2800, 3000]) {
      const target = new THREE.RenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false })
      const pass = new ModelPass(`large-${size}`, renderer)
      pass.updateCompositionRole("source")
      pass.flushColorNode()
      pass.resize(size, size)
      pass.updateLogicalSize(size, size)
      pass.updateOpacity(1)
      pass.updateParams({ ...createLayer("model").params, floor: false, orbit: 0, elevation: 0, toneMapping: "none" })
      await pass.setEnvironment(MODEL_ENVIRONMENTS[0].url)
      await pass.setModel({ url })
      await pass.whenCompiled()
      pass.render(renderer, input, target, 0, 0)
      const center = Array.from(await renderer.readRenderTargetPixelsAsync(target, size / 2 - 1, size / 2 - 1, 2, 2))
      const corner = Array.from(await renderer.readRenderTargetPixelsAsync(target, 4, 4, 2, 2))
      const decode = (values) => values.slice(0, 3).map((value) => THREE.DataUtils.fromHalfFloat(value))
      near(decode(center)[0], 1, 0.03, `${size}px export renders the model`)
      near(decode(corner)[2], 1, 0.03, `${size}px export keeps the layers below`)
      samples += 2
      pass.dispose()
      target.dispose()
    }
  } finally {
    input.dispose()
    renderer.dispose()
  }
  return samples
}

export async function checkModelLayer() {
  let samples = unitChecks()
  samples += projectChecks()
  samples += await passChecks()
  samples += await pipelineChecks()
  samples += await largeTargetChecks()
  const study = assetFor(await exportGlb(studyScene), "study")
  const png = await renderLayers(
    [modelLayer(study.id, { material: "chrome", materialColor: "#ffffff", materialRoughness: 0.04 })],
    [study],
    { width: 480, height: 600 }
  )
  return { samples, png }
}
