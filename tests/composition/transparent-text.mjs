import { TextPass as RuntimeTextPass } from "@runtime/renderer/text-pass"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { TextPass } from "@/renderer/text-pass"
import { useLayerStore } from "@/store/layer-store"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function close(actual, expected, label, tolerance = 0.002) {
  assert(
    actual.length === expected.length &&
      actual.every(
        (value, i) =>
          Number.isFinite(value) && Math.abs(value - expected[i]) <= tolerance
      ),
    `${label}: expected ${expected}, received ${actual}`
  )
}

async function checkTextPasses(layer, exportedLayer) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const backdrop = [0, 0, 1, 0.4]
  const input = new THREE.DataTexture(
    new Float32Array(backdrop),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const target = new THREE.RenderTarget(256, 192, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  let samples = 0
  try {
    for (const [name, Pass, config] of [
      ["editor", TextPass, layer],
      ["runtime", RuntimeTextPass, exportedLayer],
    ]) {
      const pass = new Pass(`${name}-text`)
      try {
        pass.resize(256, 192)
        pass.updateLogicalSize(256, 192)
        pass.updateCompositionRole(config.kind)
        pass.updateCompositeMode(config.compositeMode)
        pass.updateBlendMode(config.blendMode)
        pass.flushColorNode()
        const paint = async (params, opacity = 1) => {
          pass.updateParams(params)
          pass.updateOpacity(opacity)
          pass.render(renderer, input, target, 0, 0)
          return Array.from(
            await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 192)
          )
        }
        const transparent = await paint(config.params)
        close(
          transparent.slice(0, 4),
          backdrop,
          `${name}: transparent background preserves underlying alpha`
        )
        let glyph = -1
        let softEdge = -1
        for (let i = 0; i < transparent.length; i += 4) {
          if (transparent[i] > 0.999 && transparent[i + 1] > 0.999) glyph = i
          if (transparent[i + 3] > 0.45 && transparent[i + 3] < 0.95)
            softEdge = i
        }
        assert(glyph >= 0, `${name}: no fully opaque lettering`)
        close(
          transparent.slice(glyph, glyph + 4),
          [1, 1, 1, 1],
          `${name}: white glyph is opaque`
        )
        assert(softEdge >= 0, `${name}: missing antialiased glyph edges`)
        // White over blue always retains blue=1, even along soft alpha edges.
        close([transparent[softEdge + 2]], [1], `${name}: no dark fringe`)
        const colored = await paint({ ...config.params, textColor: "#ff0000" })
        close(
          colored.slice(glyph, glyph + 4),
          [1, 0, 0, 1],
          `${name}: glyph color is editable`
        )
        close(
          colored.slice(0, 4),
          backdrop,
          `${name}: color leaves empty regions untouched`
        )
        const solid = await paint({ ...config.params, backgroundAlpha: 1 })
        close(
          solid.slice(0, 4),
          [0, 0, 0, 1],
          `${name}: deliberate solid background`
        )
        const faded = await paint(config.params, 0.5)
        close(
          faded.slice(0, 4),
          backdrop,
          `${name}: opacity does not fill empty regions`
        )
        close(
          faded.slice(glyph, glyph + 4),
          [5 / 7, 5 / 7, 1, 0.7],
          `${name}: glyph opacity composites correctly`
        )
        const legacyParams = { ...config.params }
        delete legacyParams.backgroundAlpha
        const legacy = await paint(legacyParams)
        close(
          legacy.slice(0, 4),
          [0, 0, 0, 1],
          `${name}: absent runtime parameter retains solid fallback`
        )
        samples += 9
      } finally {
        pass.dispose()
      }
    }
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
  return samples
}

export async function checkTransparentText(renderProject) {
  const fixture = await (
    await fetch("/fixtures/solid-text-background.json")
  ).json()
  const text = createLayer("text")
  assert(
    text.compositeMode === "filter" &&
      text.blendMode === "normal" &&
      text.opacity === 1 &&
      text.params.backgroundAlpha === 0,
    "New text requires a mask, a blend workaround, or an opaque background"
  )

  // Exercise real editor hydration, including files that relied on defaults.
  for (const version of [1, 6, 7]) {
    for (const alpha of [undefined, 0, 0.35, 1]) {
      for (const mode of ["filter", "mask"]) {
        const old = structuredClone(fixture)
        old.version = version
        old.layers[0].compositeMode = mode
        old.layers[0].blendMode = "screen"
        if (alpha === undefined) delete old.layers[0].params.backgroundAlpha
        else old.layers[0].params.backgroundAlpha = alpha
        applyLabProjectFile(parseLabProjectFileValue(old), [])
        const restored = useLayerStore.getState().layers[0]
        assert(
          restored.params.backgroundAlpha === (alpha ?? 1) &&
            restored.compositeMode === mode &&
            restored.blendMode === "screen",
          "Hydration changed saved text opacity, mask mode, or blend mode"
        )
      }
    }
  }

  // Use a bundled deterministic font; leave new composition/alpha defaults intact.
  text.params = {
    ...text.params,
    text: "V3",
    fontFamily: "mono",
    fontWeight: 400,
    fontSize: 96,
    letterSpacing: 0,
  }
  const project = {
    ...fixture,
    layers: [text],
    assets: [],
    selectedLayerId: text.id,
    sceneConfig: { ...fixture.sceneConfig, backgroundColor: "#2468cc" },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const reopened = buildLabProjectFile()
  assert(
    reopened.layers[0].params.backgroundAlpha === 0 &&
      reopened.layers[0].compositeMode === "filter",
    "Save/reopen lost transparent text"
  )
  const config = buildShaderExportConfig({
    ...reopened,
    timeline: reopened.timeline,
  })
  assert(
    config.layers[0].params.backgroundAlpha === 0 &&
      config.layers[0].compositeMode === "filter",
    "Shader export lost transparent text"
  )
  const transparent = await renderProject(saved)
  close(
    Array.from(transparent.image.data.slice(0, 4)),
    [36, 104, 204, 255],
    "Preview/PNG reveal background",
    1
  )
  const restored = await renderProject(reopened)
  close(
    Array.from(restored.image.data),
    Array.from(transparent.image.data),
    "Saved/reopened text pixels",
    0
  )
  const solidFile = structuredClone(saved)
  solidFile.layers[0].params.backgroundAlpha = 1
  const solid = await renderProject(solidFile)
  close(
    Array.from(solid.image.data.slice(0, 4)),
    [0, 0, 0, 255],
    "Optional solid background in preview/PNG",
    0
  )
  return {
    samples: await checkTextPasses(reopened.layers[0], config.layers[0]),
    png: transparent.png,
  }
}
