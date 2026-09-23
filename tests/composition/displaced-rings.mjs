import { DisplacedRingsPass as RuntimeRings } from "@runtime/renderer/displaced-rings-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import * as THREE from "three/webgpu"
import { texture } from "three/tsl"
import { DisplacedRingsPass } from "@/renderer/displaced-rings-pass"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { useLayerStore } from "@/store/layer-store"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, message) {
  if (!value) throw new Error(message)
}
function close(actual, expected, label, tolerance = 0.003) {
  assert(actual.length === expected.length, `${label}: length mismatch`)
  for (let i = 0; i < actual.length; i++)
    assert(
      Number.isFinite(actual[i]) &&
        Math.abs(actual[i] - expected[i]) <= tolerance,
      `${label}: channel ${i}, got ${actual[i]}, expected ${expected[i]}`
    )
}
const identity = {
  count: 8,
  offset: [0, 0],
  rotation: 0,
  rotationStep: 0,
  scaleStep: 0,
  radius: 2,
  gap: 0,
  output: "distort",
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(
    new Float32Array([1, 0.25, 0.1, 0.6]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const photoData = new Float32Array(128 * 96 * 4)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 128; x++) {
      photoData.set(
        [x / 127, y / 95, 0.4, x < 64 && y < 48 ? 0 : 0.6],
        (y * 128 + x) * 4
      )
    }
  }
  const patterned = new THREE.DataTexture(
    photoData,
    128,
    96,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  patterned.needsUpdate = true
  let activeInput = input
  const target = new THREE.RenderTarget(128, 96, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const expectedByCase = new Map()
  let samples = 0
  let denseMs = 0
  try {
    for (const [name, Pass] of [
      ["editor", DisplacedRingsPass],
      ["runtime", RuntimeRings],
    ]) {
      const pass = new Pass(`rings-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const paint = async (label, params, opacity = 1) => {
        pass.resize(target.width, target.height)
        pass.updateLogicalSize(target.width, target.height)
        pass.updateParams(params)
        pass.updateOpacity(opacity)
        pass.render(renderer, activeInput, target, 0, 0)
        const data = Array.from(
          await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            target.width,
            target.height
          )
        )
        assert(
          data.every(Number.isFinite),
          `${name}: ${label} emitted nonfinite pixels`
        )
        if (name === "editor") expectedByCase.set(label, data)
        else
          close(data, expectedByCase.get(label), `Editor/runtime ${label}`, 0)
        samples++
        return data
      }
      try {
        for (const count of [1, 8, 48, 128]) {
          const pixels = await paint(`identity-${count}`, {
            ...identity,
            count,
          })
          for (let i = 0; i < pixels.length; i += 4)
            close(
              pixels.slice(i, i + 4),
              [1, 0.25, 0.1, 0.6],
              `${name}: ${count}-ring identity`
            )
        }
        const touching = await paint("touching-cutout-bands", {
          ...identity,
          output: "cutout",
        })
        for (let i = 0; i < touching.length; i += 4)
          close(
            touching.slice(i, i + 4),
            [1, 0.25, 0.1, 0.6],
            `${name}: touching bands gained a transparent seam`
          )
        const circle = { ...identity, count: 1, radius: 0.3, output: "cutout" }
        const cutout = await paint("circle", circle)
        const at = (pixels, x, y) =>
          pixels.slice(
            (y * target.width + x) * 4,
            (y * target.width + x) * 4 + 4
          )
        close(at(cutout, 0, 0), [0, 0, 0, 0], `${name}: cutout corner`)
        close(at(cutout, 64, 48), [1, 0.25, 0.1, 0.6], `${name}: circle center`)
        let edges = 0
        for (let i = 0; i < cutout.length; i += 4) {
          if (cutout[i + 3] > 0.01 && cutout[i + 3] < 0.59) {
            close(
              cutout.slice(i, i + 3),
              [1, 0.25, 0.1],
              `${name}: soft edge color`
            )
            edges++
          }
        }
        assert(edges > 0, `${name}: circle edges are not antialiased`)
        const half = await paint("half-disc", {
          ...circle,
          shape: "half-discs",
        })
        const top = at(half, 64, 30)[3]
        const bottom = at(half, 64, 66)[3]
        assert(
          Math.abs(top - bottom) > 0.59,
          `${name}: half-disc did not split the circle`
        )
        const faded = await paint("opacity", circle, 0.5)
        close(
          at(faded, 0, 0),
          [1, 0.25, 0.1, 0.3],
          `${name}: opacity interpolates coverage`
        )
        const off = await paint("opacity-zero", circle, 0)
        close(
          at(off, 0, 0),
          [1, 0.25, 0.1, 0.6],
          `${name}: zero opacity restores input`
        )
        const empty = await paint("gap-one", { ...circle, gap: 1 })
        assert(
          empty.every((value) => value === 0),
          `${name}: full gap retained coverage`
        )
        await paint("soft-half-discs", {
          count: 12,
          shape: "half-discs",
          output: "cutout",
          offset: [0.07, 0.02],
          softness: 0.02,
          distribution: 2,
          rotationStep: -23,
          scaleStep: -0.5,
        })
        const random = {
          count: 48,
          output: "cutout",
          pattern: "random",
          seed: 42,
          offset: [0.2, 0.1],
          rotationStep: 35,
        }
        const first = await paint("random", random)
        close(
          await paint("random-repeat", random),
          first,
          `${name}: seed changed between frames`,
          0
        )
        const second = await paint("different-seed", { ...random, seed: 43 })
        assert(
          second.some((value, i) => Math.abs(value - first[i]) > 0.1),
          `${name}: seed has no effect`
        )

        activeInput = patterned
        const unrotated = await paint("pattern-identity", {
          ...identity,
          count: 1,
          output: "cutout",
        })
        const rotated = await paint("pattern-rotated", {
          ...identity,
          count: 1,
          output: "cutout",
          rotation: 180,
        })
        for (const [x, y] of [
          [10, 10],
          [90, 15],
          [20, 75],
          [100, 70],
        ]) {
          close(
            at(rotated, x, y),
            at(unrotated, 127 - x, 95 - y),
            `${name}: rotation transports color and coverage`
          )
        }
        activeInput = input

        target.setSize(512, 384)
        const start = performance.now()
        const dense = await paint("48-distinct-rings", {
          ...circle,
          count: 48,
          radius: 0.45,
          gap: 0.5,
        })
        denseMs = Math.max(denseMs, performance.now() - start)
        let bands = 0
        let previous = false
        for (let x = 256; x < 512; x++) {
          const inside = at(dense, x, 192)[3] > 0.3
          if (inside && !previous) bands++
          previous = inside
        }
        assert(
          bands === 48,
          `${name}: expected 48 distinct radial bands, found ${bands}`
        )
      } finally {
        pass.dispose()
        target.setSize(128, 96)
      }
    }
  } finally {
    patterned.dispose()
    input.dispose()
    target.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
  return { samples, denseMs: Math.round(denseMs) }
}

async function featureChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const W = 128
  const H = 96
  const data = new Float32Array(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      data.set([x / (W - 1), y / (H - 1), ((x * 7 + y * 3) % 17) / 16, 1], (y * W + x) * 4)
  const input = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  const expected = new Map()
  let samples = 0
  const base = { ...identity, shape: "rings", ringShape: "circle", lines: "none" }
  try {
    for (const [name, Pass] of [
      ["editor", DisplacedRingsPass],
      ["runtime", RuntimeRings],
    ]) {
      const pass = new Pass(`ring-features-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const paint = async (label, params) => {
        pass.resize(W, H)
        pass.updateLogicalSize(W, H)
        pass.updateParams(params)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
        assert(pixels.every(Number.isFinite), `${name}: ${label} emitted nonfinite pixels`)
        if (name === "editor") expected.set(label, pixels)
        else close(pixels, expected.get(label), `Editor/runtime ${label}`, 0.002)
        samples++
        return pixels
      }
      const at = (pixels, x, y) => pixels.slice((y * W + x) * 4, (y * W + x) * 4 + 4)
      const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 0.01)

      for (const ringShape of ["triangle", "square", "polygon"]) {
        const pixels = await paint(`identity-${ringShape}`, { ...base, ringShape, sides: 7 })
        close(pixels, Array.from(data), `${name}: ${ringShape} bands with no transform keep the image`, 0.002)
      }
      const plain = await paint("rotated circle", { ...base, count: 6, radius: 0.9, rotationStep: 20 })
      const jittered = await paint("rotation jitter", { ...base, count: 6, radius: 0.9, rotationStep: 20, rotationJitter: 60 })
      assert(differs(plain, jittered), `${name}: rotation jitter turns bands individually`)
      const square = await paint("rotated square", { ...base, count: 6, radius: 0.9, rotationStep: 20, ringShape: "square" })
      assert(differs(plain, square), `${name}: square bands differ from circles once rotated`)
      const widths = await paint("width jitter", { ...base, count: 6, radius: 0.9, rotationStep: 20, widthJitter: 1 })
      assert(differs(plain, widths), `${name}: width jitter moves the band boundaries`)
      const lineParams = { ...base, count: 5, radius: 0.5, lineColor: "#ff0000", lineWidth: 2, lineOpacity: 1 }
      const noLines = await paint("no lines", lineParams)
      close(noLines, Array.from(data), `${name}: lines off leaves the image`, 0.002)
      const bands = await paint("band lines", { ...lineParams, lines: "bands" })
      const ring = at(bands, 64 + 29, 48)
      assert(ring[0] > 0.85 && ring[1] < 0.25, `${name}: band edges get lines (${ring})`)
      const beyondOff = at(bands, 64 + 58, 48)
      assert(!(beyondOff[0] > 0.85 && beyondOff[1] < 0.25), `${name}: band lines stop at the outer band`)
      const extended = await paint("extended lines", { ...lineParams, lines: "extended" })
      const beyond = [56, 57, 58, 59].map((dx) => at(extended, 64 + dx, 48))
      assert(beyond.some((p) => p[0] > 0.85 && p[1] < 0.25), `${name}: extended lines continue past the outer band`)
      pass.dispose()
    }
  } finally {
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
}

function solid(id, color) {
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
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((i) => [`point${i}Color`, color])
      ),
    },
  }
}

async function checkExportedRuntime(config) {
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
  const target = new THREE.RenderTarget(128, 96, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, config.composition)
    headless.render(frame)
    while (compiling.length) await Promise.all(compiling.splice(0))
    material.colorNode = texture(headless.render(frame))
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    const pixels = Array.from(
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 96)
    )
    close(
      pixels.slice(0, 4),
      [0, 0, 1, 1],
      "Runtime cutout reveals external blue layer"
    )
    const center = (48 * 128 + 64) * 4
    close(
      pixels.slice(center, center + 4),
      [1, 0, 0, 1],
      "Runtime group retains red disc"
    )
  } finally {
    headless.dispose()
    target.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
}

export async function checkDisplacedRings(renderProject) {
  const curated = createLayer("displaced-rings").params
  assert(
    curated.shape === "half-discs" &&
      curated.count === 22 &&
      curated.radius === 2 &&
      curated.rotationStep === 45 &&
      curated.gap === 0 &&
      curated.offset.every((value) => value === 0),
    "New rings lost user-curated defaults"
  )
  const checks = await passChecks()
  const group = { ...createLayer("group"), id: "portrait" }
  const rings = {
    ...createLayer("displaced-rings"),
    id: "rings",
    parentId: group.id,
    params: { ...identity, count: 1, radius: 0.3, output: "cutout" },
  }
  const red = { ...solid("red", "#ff0000"), parentId: group.id }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [group, rings, red, solid("blue", "#0000ff")],
    selectedLayerId: rings.id,
    composition: { width: 128, height: 96 },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  const missing = {
    ...project,
    layers: [{ ...rings, parentId: null, params: {} }],
  }
  applyLabProjectFile(parseLabProjectFileValue(missing), [])
  const legacy = useLayerStore.getState().getLayerById(rings.id).params
  assert(
    legacy.shape === "rings" &&
      legacy.count === 8 &&
      legacy.radius === 0.9 &&
      legacy.rotationStep === 12 &&
      legacy.gap === 0.04 &&
      legacy.offset[0] === 0.045,
    "Missing saved ring settings adopted new defaults"
  )
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const before = buildEditorHistorySnapshot()
  useLayerStore.getState().updateLayerParam(rings.id, "count", 48)
  applyEditorHistorySnapshot(before)
  assert(
    useLayerStore.getState().getLayerById(rings.id).params.count === 1,
    "History lost ring parameters"
  )
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const reopened = buildLabProjectFile()
  assert(
    reopened.layers[1].type === "displaced-rings" &&
      reopened.layers[1].parentId === group.id,
    "Hydration lost rings or membership"
  )
  const config = buildShaderExportConfig(reopened)
  await checkExportedRuntime(config)
  const first = await renderProject(saved)
  close(
    Array.from(first.image.data.slice(0, 4)),
    [0, 0, 255, 255],
    "Editor group cutout reveals background",
    1
  )
  const center = (48 * 128 + 64) * 4
  close(
    Array.from(first.image.data.slice(center, center + 4)),
    [255, 0, 0, 255],
    "Editor ring center",
    1
  )
  const restored = await renderProject(reopened)
  close(
    Array.from(restored.image.data),
    Array.from(first.image.data),
    "Reopened cutout pixels",
    0
  )

  // Reuse the bundled photographic catalog image for an offline visual check.
  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/rings-photo.webp",
    fileName: "slice.webp",
    width: 1512,
    height: 908,
  }
  const photo = {
    ...createLayer("image"),
    id: "photo",
    parentId: group.id,
    assetId: asset.id,
  }
  const art = {
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      group,
      {
        ...rings,
        params: {
          ...createLayer("displaced-rings").params,
          shape: "half-discs",
          count: 8,
          output: "cutout",
          radius: 0.8,
          rotationStep: 27,
          offset: [0.09, 0.025],
          gap: 0.07,
        },
      },
      photo,
    ],
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#141416" },
  }
  const featureSamples = await featureChecks()
  const threshold = {
    ...createLayer("threshold"),
    id: "duotone",
    parentId: group.id,
    params: {
      ...createLayer("threshold").params,
      threshold: 0.55,
      softness: 0.05,
      noise: 0.12,
      darkColor: "#050507",
      lightColor: "#2f7bff",
    },
  }
  const studies = {}
  for (const [label, extra] of [
    ["circle", { ringShape: "circle" }],
    ["square", { ringShape: "square" }],
    ["triangle", { ringShape: "triangle", shape: "half-discs" }],
  ]) {
    const study = await renderProject({
      ...art,
      layers: [
        group,
        {
          ...rings,
          params: {
            ...createLayer("displaced-rings").params,
            shape: "rings",
            count: 9,
            output: "cutout",
            radius: 1.1,
            rotationStep: 0,
            rotationJitter: 38,
            widthJitter: 0.6,
            offset: [0, 0],
            gap: 0,
            seed: 7,
            lines: "extended",
            lineWidth: 1.25,
            lineColor: "#2f7bff",
            lineOpacity: 0.85,
            ...extra,
          },
        },
        threshold,
        photo,
      ],
      sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#0a0a0c" },
    })
    studies[label] = study.png
  }
  const preview = await renderProject(art)
  const colors = new Set()
  for (let i = 0; i < preview.image.data.length; i += 4)
    colors.add(preview.image.data.slice(i, i + 3).join(","))
  assert(colors.size > 100, "Photographic ring preview is blank")
  const thumbnail = document.createElement("canvas")
  thumbnail.width = preview.image.width
  thumbnail.height = preview.image.height
  thumbnail.getContext("2d").putImageData(preview.image, 0, 0)
  return {
    ...checks,
    samples: checks.samples + featureSamples,
    studies,
    png: first.png,
    previewPng: preview.png,
    previewWebp: thumbnail.toDataURL("image/webp", 0.85),
  }
}
