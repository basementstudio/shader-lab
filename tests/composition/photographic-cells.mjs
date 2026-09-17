import { PhotographicCellsPass as RuntimeCells } from "@runtime/renderer/photographic-cells-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import * as THREE from "three/webgpu"
import { texture } from "three/tsl"
import { PhotographicCellsPass } from "@/renderer/photographic-cells-pass"
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
function close(actual, expected, label, tolerance = 0.003) {
  assert(actual.length === expected.length, `${label}: wrong size`)
  actual.forEach((value, i) => {
    assert(
      Number.isFinite(value) && Math.abs(value - expected[i]) <= tolerance,
      `${label}: ${i} got ${value}, expected ${expected[i]}`
    )
  })
}
const identity = {
  threshold: 0,
  gap: 0,
  outline: 0,
  irregularity: 0,
  size: 0.25,
}

async function gpuChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const color = [0.8, 0.3, 0.1, 0.6]
  const solid = new THREE.DataTexture(
    new Float32Array(color),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  solid.needsUpdate = true
  const data = new Float32Array(64 * 64 * 4)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      data.set(
        [x / 63, y / 63, 0.4, x < 32 && y < 32 ? 0 : 0.6],
        (y * 64 + x) * 4
      )
  const photo = new THREE.DataTexture(
    data,
    64,
    64,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  photo.needsUpdate = true
  const target = new THREE.RenderTarget(64, 64, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const expected = new Map()
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", PhotographicCellsPass],
      ["runtime", RuntimeCells],
    ]) {
      const pass = new Pass(`cells-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const at = (pixels, x, y) =>
        pixels.slice((y * target.width + x) * 4, (y * target.width + x) * 4 + 4)
      const paint = async (label, params, input = solid, opacity = 1) => {
        pass.resize(target.width, target.height)
        pass.updateLogicalSize(target.width, target.height)
        pass.updateParams(params)
        pass.updateOpacity(opacity)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(
          await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            target.width,
            target.height
          )
        )
        assert(pixels.every(Number.isFinite), `${name}: nonfinite ${label}`)
        if (name === "editor") expected.set(label, pixels)
        else close(pixels, expected.get(label), `Runtime parity ${label}`, 0)
        samples++
        return pixels
      }
      try {
        const all = await paint("all", identity)
        for (let i = 0; i < all.length; i += 4)
          close(all.slice(i, i + 4), color, "Identity coverage")
        const empty = await paint("none", { ...identity, threshold: 1 })
        assert(
          empty.every((value) => value === 0),
          "Threshold 1 must clear every cell"
        )
        close(
          await paint("invert", { ...identity, threshold: 1, invert: true }),
          all,
          "Invert selection"
        )
        assert(
          (
            await paint("full-gap", { ...identity, gap: 1, outline: 0.5 })
          ).every((value) => value === 0),
          "Full gaps retained outlines"
        )
        assert(
          (
            await paint("light", {
              ...identity,
              threshold: 0.5,
              selection: "light",
            })
          ).every((value) => value === 0),
          "Light selection ignored tone"
        )
        close(
          await paint("dark", {
            ...identity,
            threshold: 0.5,
            selection: "dark",
          }),
          all,
          "Dark selection"
        )
        const gap = await paint("gap", { ...identity, gap: 0.3 })
        close(at(gap, 8, 8), color, "Cell interior")
        close(at(gap, 16, 8), [0, 0, 0, 0], "Gap transparency")
        const soft = await paint("soft", {
          ...identity,
          gap: 0.3,
          softness: 0.02,
        })
        let edges = 0
        for (let i = 0; i < soft.length; i += 4)
          if (soft[i + 3] > 0.01 && soft[i + 3] < 0.59) {
            close(soft.slice(i, i + 3), color.slice(0, 3), "Undimmed soft edge")
            edges++
          }
        assert(edges > 0, "Missing soft edges")
        const outlined = await paint("outline", {
          ...identity,
          gap: 0.2,
          outline: 0.15,
          outlineColor: "#00ff00",
        })
        close(at(outlined, 2, 8), [0, 1, 0, 0.6], "Outline color")
        close(at(outlined, 8, 8), color, "Outline replaced photo interior")
        // Measure visible outline ink, including fractional edge coverage, rather
        // than counting bright pixels (which misses subpixel stroke inflation).
        target.setSize(256, 256)
        for (const output of ["cutout", "keep-image"]) {
          for (const outline of [0.01, 0.08]) {
            for (const softness of [0, 0.02]) {
              for (const gap of [0, 0.125, 0.25, 0.5]) {
                const pixels = await paint(
                  `stroke-width-${output}-${outline}-${softness}-${gap}`,
                  {
                    ...identity,
                    output,
                    outline,
                    softness,
                    gap,
                    outlineColor: "#00ff00",
                  }
                )
                let ink = 0
                // Left edge of one cell, away from corners and adjacent strokes.
                for (let x = 0; x < 32; x++) {
                  const pixel = at(pixels, x, 32)
                  ink +=
                    ((pixel[1] - color[1]) / (1 - color[1])) *
                    (pixel[3] / color[3])
                }
                // Softness can clip a fade against the zero-gap partition; the
                // separated edges must still carry only the requested ink width.
                if (softness === 0 || gap >= 0.25)
                  close(
                    [ink],
                    [64 * outline],
                    "Gap inflated outline width",
                    0.1
                  )
              }
            }
          }
        }
        target.setSize(64, 64)
        close(
          await paint("disabled", { ...identity, threshold: 1 }, solid, 0),
          all,
          "Zero opacity restores source"
        )
        close(
          at(
            await paint(
              "half-opacity",
              { ...identity, threshold: 1 },
              solid,
              0.5
            ),
            8,
            8
          ),
          [0.8, 0.3, 0.1, 0.3],
          "Opacity interpolates coverage"
        )
        close(
          await paint("keep-image", {
            ...identity,
            threshold: 1,
            output: "keep-image",
          }),
          all,
          "Keep Image coverage"
        )
        const random = {
          ...identity,
          selection: "random",
          threshold: 0.5,
          seed: 31,
          irregularity: 0.7,
        }
        const first = await paint("random", random)
        assert(
          first.some((value, i) => i % 4 === 3 && value > 0.59) &&
            first.some((value, i) => i % 4 === 3 && value === 0),
          "Random selection is empty or full"
        )
        close(
          await paint("random-repeat", random),
          first,
          "Deterministic cells",
          0
        )
        assert(
          (await paint("random-seed", { ...random, seed: 73 })).some(
            (value, i) => Math.abs(value - first[i]) > 0.1
          ),
          "Seed did not change cells"
        )
        const detail = await paint("photo-detail", identity, photo)
        assert(
          Math.abs(at(detail, 40, 40)[0] - at(detail, 44, 40)[0]) > 0.04,
          "Photo detail was flattened to cell color"
        )
        const photoOutline = await paint(
          "photo-outline",
          { ...identity, outline: 0.3, outlineColor: "#00ff00" },
          photo
        )
        for (let i = 0; i < detail.length; i += 4)
          if (detail[i + 3] === 0)
            close(
              photoOutline.slice(i, i + 4),
              [0, 0, 0, 0],
              "Outline created opaque pixels outside the photo"
            )
        await paint("extremes", {
          size: 0.015,
          cellAspect: 4,
          irregularity: 1,
          gap: 0.99,
          softness: 0.025,
          seed: 1000,
          outline: 0.5,
        })
        await paint("invalid-numbers", {
          size: Number.NaN,
          gap: Number.POSITIVE_INFINITY,
          threshold: -4,
        })
        target.setSize(128, 64)
        const wide = await paint("wide", { ...identity, gap: 0.5 })
        let bands = 0
        let previous = false
        for (let x = 0; x < 128; x++) {
          const inside = at(wide, x, 8)[3] > 0.3
          if (inside && !previous) bands++
          previous = inside
        }
        assert(bands === 8, `Rectangular canvas stretched cells: ${bands}`)
      } finally {
        pass.dispose()
        target.setSize(64, 64)
      }
    }
  } finally {
    solid.dispose()
    photo.dispose()
    target.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
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

async function runtimeCheck(config) {
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
      pixels.slice((48 * 128 + 64) * 4, (48 * 128 + 64) * 4 + 4),
      [0, 0, 1, 1],
      "Runtime group gaps"
    )
    close(
      pixels.slice((72 * 128 + 88) * 4, (72 * 128 + 88) * 4 + 4),
      [1, 0, 0, 1],
      "Runtime photo cells"
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

export async function checkPhotographicCells(renderProject) {
  const samples = await gpuChecks()
  const group = { ...createLayer("group"), id: "portrait" }
  const cells = {
    ...createLayer("photographic-cells"),
    id: "cells",
    parentId: group.id,
    params: { ...identity, size: 0.5, gap: 0.5 },
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [
      group,
      cells,
      { ...solid("red", "#ff0000"), parentId: group.id },
      solid("blue", "#0000ff"),
    ],
    selectedLayerId: cells.id,
    composition: { width: 128, height: 96 },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const before = buildEditorHistorySnapshot()
  useLayerStore.getState().updateLayerParam(cells.id, "threshold", 1)
  applyEditorHistorySnapshot(before)
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.threshold === 0,
    "History lost cell settings"
  )
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const reopened = buildLabProjectFile()
  assert(
    reopened.layers[1].type === "photographic-cells" &&
      reopened.layers[1].parentId === group.id,
    "Hydration lost cells/group membership"
  )
  await runtimeCheck(buildShaderExportConfig(reopened))
  const first = await renderProject(saved)
  close(
    Array.from(
      first.image.data.slice((48 * 128 + 64) * 4, (48 * 128 + 64) * 4 + 4)
    ),
    [0, 0, 255, 255],
    "Editor group gaps",
    1
  )
  close(
    Array.from(
      first.image.data.slice((72 * 128 + 88) * 4, (72 * 128 + 88) * 4 + 4)
    ),
    [255, 0, 0, 255],
    "Editor photo cells",
    1
  )
  const restored = await renderProject(reopened)
  close(
    Array.from(restored.image.data),
    Array.from(first.image.data),
    "Reopened pixels",
    0
  )
  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/rings-photo.webp",
    fileName: "slice.webp",
    width: 1512,
    height: 908,
  }
  const art = {
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      group,
      { ...cells, params: createLayer("photographic-cells").params },
      {
        ...createLayer("image"),
        id: "photo",
        assetId: asset.id,
        parentId: group.id,
      },
    ],
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#141416" },
  }
  const preview = await renderProject(art)
  const colors = new Set()
  for (let i = 0; i < preview.image.data.length; i += 4)
    colors.add(preview.image.data.slice(i, i + 3).join(","))
  assert(colors.size > 100, "Cell photographic preview is blank")
  const thumbnail = document.createElement("canvas")
  thumbnail.width = preview.image.width
  thumbnail.height = preview.image.height
  thumbnail.getContext("2d").putImageData(preview.image, 0, 0)
  return {
    samples,
    png: first.png,
    previewPng: preview.png,
    previewWebp: thumbnail.toDataURL("image/webp", 0.85),
  }
}
