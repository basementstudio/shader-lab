import { MediaPass as RuntimeMediaPass } from "@runtime/renderer/media-pass"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  buildViewerProjectState,
  migrateLayerParams,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { MediaPass } from "@/renderer/media-pass"

function assertPixel(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some(
      (value, index) =>
        !Number.isFinite(value) || Math.abs(value - expected[index]) > 0.0001
    )
  ) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`)
  }
}

async function checkMediaPasses() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const backdrop = [0.2, 0.4, 0.8, 1]
  const input = new THREE.DataTexture(
    new Float32Array(backdrop),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const target = new THREE.RenderTarget(64, 48, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  let count = 0
  try {
    for (const [name, Pass] of [
      ["editor", MediaPass],
      ["runtime", RuntimeMediaPass],
    ]) {
      for (const kind of ["image", "video"]) {
        const pass = new Pass(`${name}-${kind}`)
        try {
          pass.resize(64, 48)
          const url =
            kind === "image"
              ? "/scenes/default/alpha-sample.svg"
              : "/scenes/default/aura.mp4"
          if (name === "editor") {
            await pass.setMedia({
              url,
              kind,
              isSvg: kind === "image",
              width: kind === "image" ? 160 : 578,
              height: kind === "image" ? 160 : 720,
            })
            pass.setPreviewFrozen(true)
            await pass.prepareForExportFrame(0)
          } else {
            await pass.setMedia(url, kind)
          }
          const render = async (params, opacity = 1) => {
            pass.updateParams(params)
            pass.updateOpacity(opacity)
            pass.render(renderer, input, target, 0, 0)
            return Array.from(
              await renderer.readRenderTargetPixelsAsync(target, 0, 24, 64, 1)
            )
          }
          for (const placement of [
            { scale: 1, offset: [0, 0] },
            { scale: 0.5, offset: [0.2, 0] },
          ]) {
            const params = { ...placement, fitMode: "contain" }
            const legacy = await render(params)
            const solid = await render({ ...params, transparentBounds: false })
            const transparent = await render({
              ...params,
              transparentBounds: true,
            })
            const faded = await render(
              { ...params, transparentBounds: true },
              0.35
            )
            assertPixel(
              legacy.slice(0, 4),
              [0, 0, 0, 1],
              `${name}/${kind}: absent flag keeps black borders`
            )
            assertPixel(
              solid.slice(0, 4),
              [0, 0, 0, 1],
              `${name}/${kind}: explicit solid borders`
            )
            assertPixel(
              transparent.slice(0, 4),
              backdrop,
              `${name}/${kind}: empty border reveals lower layer`
            )
            assertPixel(
              faded.slice(0, 4),
              backdrop,
              `${name}/${kind}: empty border stays clear at partial opacity`
            )
            if (kind === "image") {
              // The square SVG center remains opaque; its hue/coverage must
              // not change when only the out-of-bounds behavior changes.
              const center = placement.scale === 1 ? 32 : 37
              assertPixel(
                transparent.slice(center * 4, center * 4 + 4),
                solid.slice(center * 4, center * 4 + 4),
                `${name}: in-bounds content is unchanged`
              )
              if (transparent[center * 4] < 0.5)
                throw new Error(`${name}: opaque center lost its color`)
            }
            count += 4
          }
          if (kind === "image") {
            const params = { fitMode: "cover", scale: 0.5, offset: [0.2, 0] }
            assertPixel(
              await render({ ...params, transparentBounds: true }),
              await render({ ...params, transparentBounds: false }),
              `${name}: cover mode is unchanged`
            )
            count++
          }
        } finally {
          pass.dispose()
        }
      }
    }
    return count
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
  }
}

export async function checkMediaBounds(renderProject) {
  for (const type of ["image", "video"]) {
    const layer = createLayer(type)
    if (layer.params.transparentBounds !== true)
      throw new Error(`New ${type} layer has opaque borders`)
    for (const value of [undefined, false, true]) {
      const params = { ...layer.params }
      if (value === undefined) delete params.transparentBounds
      else params.transparentBounds = value
      for (const version of [1, 5, 6]) {
        if (
          migrateLayerParams({ ...layer, params }, version)
            .transparentBounds !== (value ?? false)
        ) {
          throw new Error(
            `${type} migration changed the explicit or legacy border setting`
          )
        }
      }
    }
  }

  const project = parseLabProjectFileValue(
    await (await fetch("/fixtures/contained-image-halftone.json")).json()
  )
  project.layers = project.layers.filter((layer) => layer.type === "image")
  project.selectedLayerId = project.layers[0].id
  project.layers[0].params.transparentBounds = true
  project.sceneConfig.backgroundColor = "#2468cc"
  applyLabProjectFile(project, [])
  const saved = buildLabProjectFile()
  const state = buildViewerProjectState(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved)))
  )
  if (state.layers[0].params.transparentBounds !== true)
    throw new Error("Save/reopen lost transparent borders")
  const config = buildShaderExportConfig({
    ...state,
    composition: project.composition,
  })
  if (config.layers[0].params.transparentBounds !== true)
    throw new Error("Shader export lost transparent borders")

  const transparent = await renderProject(saved)
  project.layers[0].params.transparentBounds = false
  const solid = await renderProject(project)
  const pixel = (result, x, y) =>
    Array.from(
      result.image.data.slice(
        (y * result.image.width + x) * 4,
        (y * result.image.width + x) * 4 + 4
      )
    )
  assertPixel(
    pixel(transparent, 4, 96),
    [36, 104, 204, 255],
    "PNG export reveals scene background"
  )
  assertPixel(
    pixel(solid, 4, 96),
    [0, 0, 0, 255],
    "PNG export preserves solid borders"
  )
  assertPixel(
    pixel(transparent, 128, 96),
    pixel(solid, 128, 96),
    "PNG export preserves opaque image content"
  )
  return {
    samples: await checkMediaPasses(),
    transparentPng: transparent.png,
    solidPng: solid.png,
  }
}
