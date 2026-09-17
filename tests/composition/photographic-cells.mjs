import {
  decodeCellPaintMask,
  encodeCellPaintMask,
  emptyCellPaintMask,
} from "@/renderer/cell-paint-mask"
import {
  expandCellPaintMask,
  paintCellSegment,
} from "@/lib/editor/paint/cell-paint-brush"
import {
  useCellPaintStore,
  withCellPaintPreview,
} from "@/store/cell-paint-store"
import { PhotographicCellsPass as RuntimeCells } from "@runtime/renderer/photographic-cells-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import * as THREE from "three/webgpu"
import { float, texture, uv, vec2 } from "three/tsl"
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
        const paintedMask = emptyCellPaintMask()
        for (let y = 0; y < 256; y++)
          paintedMask.data.fill(255, y * 512, y * 512 + 256)
        const paintMask = encodeCellPaintMask(paintedMask)
        const paintParams = {
          ...identity,
          mode: "paint",
          paintMask,
          size: 0.125,
          threshold: 1,
        }
        const painted = await paint("paint quadrant", paintParams)
        for (let y = 0; y < 64; y++)
          for (let x = 0; x < 64; x++) {
            close(
              at(painted, x, y),
              x < 32 && y < 32 ? color : [0, 0, 0, 0],
              "Paint coordinates"
            )
          }
        close(
          await paint("paint ignores automatic selection", {
            ...paintParams,
            selection: "random",
            threshold: 0,
            regionSize: 1,
          }),
          painted,
          "Automatic controls affected paint"
        )
        const inverted = await paint("paint inverted", {
          ...paintParams,
          invert: true,
        })
        close(at(inverted, 8, 8), [0, 0, 0, 0], "Invert painted selection")
        close(at(inverted, 48, 48), color, "Invert painted complement")
        const perimeter = await paint("paint perimeter", {
          ...paintParams,
          outlineMode: "perimeter",
          outline: 0.25,
          outlineColor: "#ffffff",
        })
        close(at(perimeter, 8, 12), color, "Paint has internal perimeter seams")
        assert(
          at(perimeter, 31, 12)[1] > color[1] + 0.2,
          "Paint perimeter missing"
        )
        const detailed = await paint("paint source detail", paintParams, photo)
        close(
          at(detailed, 8, 8),
          [0, 0, 0, 0],
          "Paint manufactured source alpha"
        )
        const guided = await paint("paint guide", {
          ...paintParams,
          _paintGuide: true,
        })
        assert(
          at(guided, 48, 48)[3] > 0.05 && at(guided, 48, 48)[3] < color[3],
          "Empty area guide missing"
        )
        close(
          await paint("paint guide removed", paintParams),
          painted,
          "Guide persisted"
        )
        assert(
          (await paint("paint clear", { ...paintParams, paintMask: "" })).every(
            (v) => v === 0
          ),
          "Clearing left coverage"
        )
        assert(
          (
            await paint("paint invalid mask", {
              ...paintParams,
              paintMask: "pc1:bad",
            })
          ).every((v) => v === 0),
          "Invalid mask did not clear"
        )
        const changing = new THREE.DataTexture(
          new Float32Array([0.2, 0.7, 0.4, 0.8]),
          1,
          1,
          THREE.RGBAFormat,
          THREE.FloatType
        )
        changing.needsUpdate = true
        const frameOne = await paint(
          "paint moving source one",
          paintParams,
          changing
        )
        const uploaded = pass.paintTexture.version
        changing.image.data.set([0.7, 0.2, 0.8, 0.8])
        changing.needsUpdate = true
        const frameTwo = await paint(
          "paint moving source two",
          paintParams,
          changing
        )
        close(
          at(frameOne, 8, 8),
          [0.2, 0.7, 0.4, 0.8],
          "Paint first source frame"
        )
        close(
          at(frameTwo, 8, 8),
          [0.7, 0.2, 0.8, 0.8],
          "Paint stale source frame"
        )
        assert(
          pass.paintTexture.version === uploaded,
          "Video change re-uploaded mask"
        )
        changing.dispose()
        await paint("paint invalid reset", {
          ...paintParams,
          paintMask: "pc1:bad",
        })
        const version = pass.paintTexture.version
        pass.updateParams({
          ...paintParams,
          paintMask: "pc1:bad",
          threshold: 0.2,
        })
        assert(
          pass.paintTexture.version === version,
          "Unchanged mask re-uploaded"
        )
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
        target.setSize(128, 128)
        const shapeData = new Float32Array(128 * 128 * 4)
        for (let y = 0; y < 128; y++)
          for (let x = 0; x < 128; x++) {
            const col = Math.floor(x / 16)
            const row = Math.floor(y / 16)
            const selected =
              (row >= 1 &&
                row <= 4 &&
                col >= 1 &&
                col <= 6 &&
                !(row >= 2 && row <= 3 && col >= 3 && col <= 4)) ||
              (row >= 5 && row <= 6 && col >= 1 && col <= 2)
            const tone = selected ? 0.8 : 0.1
            shapeData.set([tone, tone, tone, 0.6], (y * 128 + x) * 4)
          }
        const shape = new THREE.DataTexture(
          shapeData,
          128,
          128,
          THREE.RGBAFormat,
          THREE.FloatType
        )
        shape.needsUpdate = true
        try {
          const contour = {
            ...identity,
            size: 0.125,
            threshold: 0.5,
            outline: 0.15,
            outlineColor: "#00ff00",
            outlineMode: "perimeter",
          }
          const silhouette = await paint("perimeter-hole", contour, shape)
          close(
            at(silhouette, 32, 24),
            [0.8, 0.8, 0.8, 0.6],
            "Shared edge must disappear"
          )
          close(at(silhouette, 17, 24), [0, 1, 0, 0.6], "Outer perimeter")
          close(at(silhouette, 46, 40), [0, 1, 0, 0.6], "Inner hole perimeter")
          close(
            at(silhouette, 64, 40),
            [0, 0, 0, 0],
            "Hole remains transparent"
          )
          close(
            at(silhouette, 80, 80),
            [0, 0, 0, 0],
            "Concave silhouette remains cut out"
          )
          const individual = await paint(
            "perimeter-every-cell",
            { ...contour, outlineMode: "every-cell" },
            shape
          )
          assert(
            at(individual, 32, 24)[1] > 0.95,
            "Every Cell lost internal edges"
          )
          const noOutline = await paint(
            "perimeter-none",
            { ...contour, outlineMode: "none" },
            shape
          )
          close(
            at(noOutline, 17, 24),
            [0.8, 0.8, 0.8, 0.6],
            "None retained an outline"
          )
          const full = await paint(
            "perimeter-all-irregular",
            { ...contour, threshold: 0, irregularity: 1, cellAspect: 0.25 },
            solid
          )
          for (let y = 12; y < 116; y++)
            for (let x = 12; x < 116; x++)
              close(at(full, x, y), color, "Irregular row introduced a seam")
          // Compare irregular contours against the independently rendered coverage:
          // any pixel sufficiently far from a cutout must retain its source color.
          const staggered = { ...contour, irregularity: 1, cellAspect: 0.65 }
          const staggeredFill = await paint(
            "perimeter-irregular-fill",
            { ...staggered, outlineMode: "none" },
            shape
          )
          const staggeredOutline = await paint(
            "perimeter-irregular",
            staggered,
            shape
          )
          let inspected = 0
          let edgePixels = 0
          for (let y = 6; y < 122; y++)
            for (let x = 6; x < 122; x++) {
              const before = at(staggeredFill, x, y)
              const after = at(staggeredOutline, x, y)
              close(
                [after[3]],
                [before[3]],
                "Outline changed irregular coverage"
              )
              if (before[3] < 0.5) continue
              if (after[1] - before[1] > 0.1) edgePixels++
              let boundary = false
              for (let dy = -5; dy <= 5 && !boundary; dy++)
                for (let dx = -5; dx <= 5; dx++)
                  if (at(staggeredFill, x + dx, y + dy)[3] < 0.5) {
                    boundary = true
                    break
                  }
              if (!boundary) {
                close(after, before, "Irregular internal edge survived")
                inspected++
              }
            }
          assert(
            inspected > 100 && edgePixels > 100,
            "Irregular contour fixture is inconclusive"
          )
          close(
            await paint("perimeter-gaps", { ...contour, gap: 0.25 }, shape),
            await paint(
              "cell-gaps",
              { ...contour, gap: 0.25, outlineMode: "every-cell" },
              shape
            ),
            "Separated cells must outline actual gaps"
          )
          const kept = await paint(
            "perimeter-keep",
            { ...contour, output: "keep-image" },
            shape
          )
          close(
            at(kept, 64, 40),
            [0.1, 0.1, 0.1, 0.6],
            "Keep Image lost hole interior"
          )
          close(
            at(kept, 32, 24),
            [0.8, 0.8, 0.8, 0.6],
            "Keep Image added shared edge"
          )
          const transparent = await paint(
            "perimeter-transparent",
            { ...contour, threshold: 0 },
            photo
          )
          close(
            at(transparent, 1, 1),
            [0, 0, 0, 0],
            "Perimeter manufactured photo coverage"
          )
          // A soft contour on tiny cells can reach beyond the immediately
          // neighboring row/column. Compare with a straight-boundary oracle.
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const tone = x < 64 ? 0.8 : 0.1
              shapeData.set([tone, tone, tone, 0.6], (y * 128 + x) * 4)
            }
          shape.needsUpdate = true
          const broad = await paint(
            "perimeter-soft-small-cells",
            { ...contour, size: 0.015, outline: 0.5, softness: 0.025 },
            shape
          )
          const t = (0.015 * 128 * 0.5 - 2.5 + 0.025 * 128) / (2 * 0.025 * 128)
          const ink = t * t * (3 - 2 * t)
          close(
            at(broad, 61, 64),
            [0.8 * (1 - ink), 0.8 + 0.2 * ink, 0.8 * (1 - ink), 0.6],
            "Soft contour missed a boundary beyond its immediate neighbors"
          )
        } finally {
          shape.dispose()
        }
        const regions = {
          ...identity,
          mode: "regions",
          selection: "random",
          threshold: 0.5,
          regionSize: 0.4,
          size: 0.03125,
          seed: 31,
          outlineMode: "none",
        }
        const patches = await paint("regions", regions)
        const changes = (pixels) => {
          let count = 0
          for (let y = 1; y < 128; y++)
            for (let x = 1; x < 128; x++) {
              const a = at(pixels, x, y)[3] > 0.3
              if (a !== at(pixels, x - 1, y)[3] > 0.3) count++
              if (a !== at(pixels, x, y - 1)[3] > 0.3) count++
            }
          return count
        }
        const independent = await paint("regions-independent", {
          ...regions,
          mode: "cells",
        })
        assert(
          changes(patches) < changes(independent) * 0.3 && changes(patches) > 0,
          "Regions did not join cells into broad patches"
        )
        close(
          await paint("regions-repeat", regions),
          patches,
          "Region seed must remain stable",
          0
        )
        const smaller = await paint("regions-size", {
          ...regions,
          regionSize: 0.08,
        })
        assert(
          changes(smaller) > changes(patches) * 1.5,
          "Region Size did not control patch scale"
        )
        const coarse = await paint("regions-cell-size", {
          ...regions,
          size: 0.0625,
        })
        let changed = 0
        for (let i = 3; i < patches.length; i += 4)
          if (Math.abs(coarse[i] - patches[i]) > 0.1) changed++
        assert(
          changed > 0 && changed < 128 * 128 * 0.12,
          "Cell Size replaced the region field"
        )
        const inverse = await paint("regions-invert", {
          ...regions,
          invert: true,
        })
        for (let i = 3; i < patches.length; i += 4)
          close([patches[i] + inverse[i]], [0.6], "Region complement")
        assert(
          (await paint("regions-seed", { ...regions, seed: 4 })).some(
            (v, i) => Math.abs(v - patches[i]) > 0.1
          ),
          "Region seed did not change patches"
        )
        const lightRegions = await paint(
          "regions-light",
          { ...regions, selection: "light", threshold: 0.35 },
          photo
        )
        const darkRegions = await paint(
          "regions-dark",
          { ...regions, selection: "dark", threshold: 0.65 },
          photo
        )
        assert(
          lightRegions.some((v, i) => i % 4 === 3 && v > 0.5) &&
            darkRegions.some((v, i) => i % 4 === 3 && v > 0.5),
          "Image-guided regions lost source tones"
        )
        close(
          await paint("regions-all", { ...regions, threshold: 0 }),
          await paint("regions-identity", identity),
          "Region threshold zero"
        )
        assert(
          (
            await paint("regions-empty", {
              ...regions,
              threshold: 1,
              outlineMode: "perimeter",
              outline: 0.1,
            })
          ).every((v) => v === 0),
          "Empty region retained contour"
        )
        await paint(
          "regions-extremes",
          {
            ...regions,
            size: 0.015,
            regionSize: 2,
            irregularity: 1,
            cellAspect: 4,
            softness: 0.025,
            outlineMode: "perimeter",
            outline: 0.5,
          },
          photo
        )
        await paint("regions-invalid", {
          ...regions,
          regionSize: Number.NaN,
          size: Number.POSITIVE_INFINITY,
        })
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

async function runtimeCheck(config, expectedImage) {
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
    material.colorNode = texture(
      headless.render(frame),
      vec2(uv().x, float(1).sub(uv().y))
    )
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    const pixels = Array.from(
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 96)
    )
    if (expectedImage) {
      close(
        pixels,
        Array.from(expectedImage.data, (value, index) => {
          const v = value / 255
          if (index % 4 === 3) return v
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }),
        "Exported runtime connected-region coverage",
        0.005
      )
    } else {
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
    }
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
  const brush = emptyCellPaintMask()
  paintCellSegment(
    brush,
    { x: -0.35, y: -0.2 },
    { x: 0.35, y: -0.2 },
    0.08,
    false
  )
  const encoded = encodeCellPaintMask(brush)
  close(
    Array.from(decodeCellPaintMask(encoded).data),
    Array.from(brush.data),
    "Mask roundtrip",
    0
  )
  assert(encoded.length < 44000, "Unbounded mask")
  for (let x = 100; x < 410; x++)
    assert(brush.data[154 * 512 + x] === 255, "Fast stroke has gaps")
  paintCellSegment(brush, { x: 0, y: -0.2 }, { x: 0, y: -0.2 }, 0.04, true)
  assert(
    brush.data[154 * 512 + 256] === 0 && brush.data[154 * 512 + 200] === 255,
    "Erase affected wrong area"
  )
  const expanded = expandCellPaintMask(brush, 2, 1)
  assert(
    expanded.data[154 * 512 + 228] === 255 &&
      expanded.data[154 * 512 + 256] === 0,
    "Resize moved coverage"
  )
  for (const invalid of ["", "pc1:1:1:no", "x".repeat(50000)])
    assert(
      decodeCellPaintMask(invalid).data.every((v) => v === 0),
      "Invalid mask failed closed"
    )
  const samples = await gpuChecks()
  const group = { ...createLayer("group"), id: "portrait" }
  const cells = {
    ...createLayer("photographic-cells"),
    id: "cells",
    parentId: group.id,
    params: {
      ...identity,
      size: 0.5,
      gap: 0.5,
      mode: "regions",
      regionSize: 0.35,
      outlineMode: "perimeter",
      outline: 0.025,
    },
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
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.mode === "regions",
    "Hydration lost Regions mode"
  )
  const before = buildEditorHistorySnapshot()
  useLayerStore.getState().updateLayerParam(cells.id, "threshold", 1)
  useLayerStore.getState().updateLayerParam(cells.id, "mode", "cells")
  useLayerStore.getState().updateLayerParam(cells.id, "outlineMode", "none")
  applyEditorHistorySnapshot(before)
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.threshold === 0,
    "History lost cell settings"
  )
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.mode === "regions" &&
      useLayerStore.getState().getLayerById(cells.id).params.outlineMode ===
        "perimeter",
    "History lost region modes"
  )
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const reopened = buildLabProjectFile()
  for (const key of ["mode", "regionSize", "outlineMode", "outline"])
    assert(
      reopened.layers[1].params[key] === cells.params[key],
      `Save/reopen lost ${key}`
    )
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
  const regionProject = {
    ...saved,
    layers: saved.layers.map((layer) =>
      layer.id === cells.id
        ? {
            ...layer,
            params: {
              ...layer.params,
              threshold: 0.5,
              gap: 0,
              size: 0.0625,
              selection: "random",
              seed: 31,
              regionSize: 0.4,
              outline: 0,
            },
          }
        : layer
    ),
  }
  const regionPreview = await renderProject(regionProject)
  await runtimeCheck(
    buildShaderExportConfig(regionProject),
    regionPreview.image
  )
  const paintProject = {
    ...regionProject,
    layers: regionProject.layers.map((layer) =>
      layer.id === cells.id
        ? {
            ...layer,
            params: {
              ...layer.params,
              mode: "paint",
              paintMask: encoded,
              outline: 0.06,
            },
          }
        : layer
    ),
  }
  applyLabProjectFile(parseLabProjectFileValue(paintProject), [])
  const paintBefore = buildEditorHistorySnapshot()
  const duplicateId = useLayerStore.getState().duplicateLayer(cells.id)
  assert(
    useLayerStore.getState().getLayerById(duplicateId).params.paintMask ===
      encoded,
    "Duplicate lost painted selection"
  )
  applyEditorHistorySnapshot(paintBefore)
  useLayerStore.getState().updateLayerParam(cells.id, "mode", "regions")
  useLayerStore.getState().updateLayerParam(cells.id, "mode", "paint")
  useLayerStore.getState().updateLayerParam(cells.id, "size", 0.1)
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.paintMask ===
      encoded,
    "Layout or geometry erased paint"
  )
  applyEditorHistorySnapshot(paintBefore)
  useLayerStore.getState().updateLayerParam(cells.id, "paintMask", "")
  applyEditorHistorySnapshot(paintBefore)
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.paintMask ===
      encoded,
    "Paint history lost mask"
  )
  useCellPaintStore.getState().edit(cells.id)
  useCellPaintStore.getState().setDraft("")
  const previewLayers = withCellPaintPreview(
    useLayerStore.getState().layers,
    cells.id
  )
  assert(
    previewLayers.find((l) => l.id === cells.id).params._paintGuide === true,
    "Editor guide missing"
  )
  const paintSaved = buildLabProjectFile()
  assert(
    paintSaved.layers.find((l) => l.id === cells.id).params.paintMask ===
      encoded,
    "Draft leaked into save"
  )
  assert(
    !JSON.stringify(paintSaved).includes("_paintGuide"),
    "Guide leaked into save"
  )
  useCellPaintStore.getState().edit(null)
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(paintSaved))),
    []
  )
  assert(
    useLayerStore.getState().getLayerById(cells.id).params.paintMask ===
      encoded,
    "Hydration lost paint mask"
  )
  const paintPreview = await renderProject(paintSaved)
  await runtimeCheck(buildShaderExportConfig(paintSaved), paintPreview.image)
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
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#f5f2ee" },
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
  const oldCells = { ...cells, params: { outline: 0.12 } }
  applyLabProjectFile(
    parseLabProjectFileValue({ ...saved, layers: [group, oldCells] }),
    []
  )
  const legacy = useLayerStore.getState().getLayerById(cells.id).params
  assert(
    legacy.mode === "cells" &&
      legacy.outlineMode === "every-cell" &&
      legacy.outline === 0.12 &&
      legacy.size === 0.1 &&
      legacy.gap === 0.08 &&
      legacy.selection === "light" &&
      legacy.irregularity === 0.35 &&
      legacy.threshold === 0.35,
    "New region defaults changed a saved partial cell layer"
  )
  const fresh = createLayer("photographic-cells").params
  assert(
    fresh.mode === "regions" &&
      fresh.outlineMode === "perimeter" &&
      fresh.gap === 0,
    "New layers must start with connected regions"
  )
  return {
    samples,
    png: first.png,
    previewPng: preview.png,
    previewWebp: thumbnail.toDataURL("image/webp", 0.85),
  }
}
