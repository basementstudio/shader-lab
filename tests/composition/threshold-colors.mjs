import * as THREE from "three/webgpu"
import { ThresholdPass } from "@/renderer/threshold-pass"
import { ThresholdPass as RuntimeThreshold } from "@runtime/renderer/threshold-pass"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import {
  buildEditorHistorySnapshot,
  applyEditorHistorySnapshot,
} from "@/lib/editor/history"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

const assert = {
  ok(value, message) {
    if (!value) throw new Error(message)
  },
  equal(actual, expected, message) {
    if (actual !== expected)
      throw new Error(`${message}: ${actual} != ${expected}`)
  },
}
function close(actual, expected, label, epsilon = 0.0001) {
  assert.equal(actual.length, expected.length, label)
  actual.forEach((v, i) => {
    assert.ok(
      Number.isFinite(v) && Math.abs(v - expected[i]) <= epsilon,
      `${label} channel ${i}: ${v} != ${expected[i]}`
    )
  })
}
// Capture two presented frames once, so editor/runtime see the identical video
// input regardless of shader compilation timing. No paused-seek timing assumption.
async function decodeVideoFrames() {
  const video = document.createElement("video")
  video.src = "/scenes/default/aura.mp4"
  video.muted = true
  video.loop = true
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext("2d")
  const inputs = []
  try {
    await video.play()
    for (let frame = 0; frame <= 12; frame++) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Video frame timed out")),
          8000
        )
        video.requestVideoFrameCallback(() => {
          clearTimeout(timeout)
          resolve()
        })
      })
      if (frame === 0 || frame === 12) {
        context.drawImage(video, 0, 0, 64, 64)
        const input = new THREE.DataTexture(
          new Uint8Array(context.getImageData(0, 0, 64, 64).data),
          64,
          64,
          THREE.RGBAFormat
        )
        input.needsUpdate = true
        inputs.push(input)
      }
    }
    return inputs
  } catch (error) {
    for (const input of inputs) input.dispose()
    throw error
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
  }
}
export async function checkThresholdColors(renderProject) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const data = new Float32Array(64 * 4)
  for (let x = 0; x < 64; x++)
    data.set(
      [x / 63, x / 63, x / 63, [0, 0.25, 0.6, 1][Math.floor(x / 16)]],
      x * 4
    )
  const source = new THREE.DataTexture(
    data,
    64,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  source.needsUpdate = true
  const target = new THREE.RenderTarget(64, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const expected = new Map()
  let samples = 0
  const videoInputs = []
  try {
    videoInputs.push(...(await decodeVideoFrames()))
    for (const [name, Pass] of [
      ["editor", ThresholdPass],
      ["runtime", RuntimeThreshold],
    ]) {
      const pass = new Pass(`threshold-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      pass.updateLogicalSize(64, 1)
      const node = pass.material.colorNode
      const render = async (label, params, input = source, opacity = 1) => {
        pass.updateOpacity(opacity)
        pass.updateParams(params)
        pass.render(renderer, input, target, 0, 0)
        assert.equal(
          pass.material.colorNode,
          node,
          "Palette change rebuilt the material"
        )
        const pixels = Array.from(
          await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            64,
            target.height
          )
        )
        if (name === "editor") expected.set(label, pixels)
        else close(pixels, expected.get(label), `Runtime parity ${label}`, 0)
        samples++
        return pixels
      }
      try {
        const base = { threshold: 0.5, softness: 0.1, noise: 0 }
        const legacy = await render("legacy defaults", base)
        for (let x = 0; x < 64; x++) {
          const t = Math.max(0, Math.min(1, (x / 63 - 0.4) / 0.2))
          const weight = t * t * (3 - 2 * t)
          close(
            legacy.slice(x * 4, x * 4 + 4),
            [weight, weight, weight, data[x * 4 + 3]],
            "Original threshold and alpha"
          )
        }
        const palette = { darkColor: "#162fc4", lightColor: "#f04e9b" }
        const dark = new THREE.Color(palette.darkColor).toArray()
        const light = new THREE.Color(palette.lightColor).toArray()
        const colored = await render("custom colors", { ...base, ...palette })
        for (let x = 0; x < 64; x++)
          close(
            colored.slice(x * 4, x * 4 + 4),
            [
              ...dark.map((v, c) => v + (light[c] - v) * legacy[x * 4]),
              data[x * 4 + 3],
            ],
            "Palette endpoints, soft blend and source alpha"
          )
        const inverted = await render("inverted colors", {
          ...base,
          ...palette,
          invert: true,
        })
        for (let x = 0; x < 64; x++)
          close(
            inverted.slice(x * 4, x * 4 + 4),
            [
              ...dark.map((v, c) => v + (light[c] - v) * (1 - legacy[x * 4])),
              data[x * 4 + 3],
            ],
            "Invert swaps region assignment"
          )
        const noise = await render("noise legacy", { ...base, noise: 0.15 })
        const noisyColors = await render("noise colors", {
          ...base,
          ...palette,
          noise: 0.15,
        })
        for (let x = 0; x < 64; x++)
          close(
            noisyColors.slice(x * 4, x * 4 + 3),
            dark.map((v, c) => v + (light[c] - v) * noise[x * 4]),
            "Palette moved noisy boundaries"
          )
        const faded = await render(
          "opacity",
          { ...base, ...palette },
          source,
          0.4
        )
        for (let x = 0; x < 64; x++)
          close(
            faded.slice(x * 4, x * 4 + 4),
            [
              ...dark.map(
                (_, c) => data[x * 4 + c] * 0.6 + colored[x * 4 + c] * 0.4
              ),
              data[x * 4 + 3],
            ],
            "Effect opacity"
          )
        close(
          await render("reset missing colors", base),
          legacy,
          "Missing color fallbacks"
        )
        close(
          await render("explicit black white", {
            ...base,
            darkColor: "#000000",
            lightColor: "#ffffff",
          }),
          legacy,
          "Black white compatibility"
        )
        for (const threshold of [0, 0.5, 1])
          for (const invert of [false, true]) {
            const bw = await render(`hard-${threshold}-${invert}`, {
              threshold,
              softness: 0,
              noise: 0,
              invert,
            })
            const colors = await render(`hard-colors-${threshold}-${invert}`, {
              threshold,
              softness: 0,
              noise: 0,
              invert,
              ...palette,
            })
            for (let x = 0; x < 64; x++)
              close(
                colors.slice(x * 4, x * 4 + 3),
                dark.map((v, c) => v + (light[c] - v) * bw[x * 4]),
                "Hard threshold"
              )
          }
        target.setSize(64, 64)
        pass.updateLogicalSize(64, 64)
        const frames = []
        for (const [index, input] of videoInputs.entries()) {
          frames.push(
            await render(
              `video-${index}`,
              { ...base, ...palette, threshold: 0.2, softness: 0.2 },
              input
            )
          )
        }
        assert.ok(
          frames[0].some((v, i) => Math.abs(v - frames[1][i]) > 0.01),
          "Threshold did not update with the decoded video"
        )
      } finally {
        pass.dispose()
        target.setSize(64, 1)
      }
    }
  } finally {
    for (const input of videoInputs) input.dispose()
    source.dispose()
    target.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }

  const layer = {
    ...createLayer("threshold"),
    id: "threshold",
    params: {
      threshold: 0.4,
      softness: 0.02,
      noise: 0.08,
      darkColor: "#1425a8",
      lightColor: "#ff593c",
    },
  }
  const photo = { ...createLayer("image"), id: "photo", assetId: "sample" }
  const project = {
    format: "shader-lab",
    version: 7,
    composition: { width: 512, height: 384 },
    assets: [
      {
        id: "sample",
        kind: "image",
        fileName: "photo.webp",
        url: "/scenes/default/rings-photo.webp",
        width: 1512,
        height: 982,
      },
    ],
    layers: [layer, photo],
    selectedLayerId: layer.id,
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 2, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const snapshot = buildEditorHistorySnapshot()
  useLayerStore.getState().updateLayerParam(layer.id, "darkColor", "#000000")
  applyEditorHistorySnapshot(snapshot)
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  const hydrated = useLayerStore.getState().getLayerById(layer.id)
  assert.equal(
    hydrated.params.darkColor,
    layer.params.darkColor,
    "History/hydration lost dark color"
  )
  assert.equal(
    hydrated.params.lightColor,
    layer.params.lightColor,
    "Hydration lost light color"
  )
  const exported = buildShaderExportConfig(saved)
  const frame = runtimeFrame(exported, 0, 0, 1, exported.composition)
  assert.equal(
    frame.layers.find((l) => l.id === layer.id).params.darkColor,
    layer.params.darkColor,
    "Runtime export lost color"
  )
  const rendered = await renderProject(saved)
  const reopened = await renderProject(buildLabProjectFile())
  close(
    Array.from(rendered.image.data),
    Array.from(reopened.image.data),
    "Reopened PNG",
    0
  )
  const old = {
    ...project,
    layers: [
      { ...layer, params: { threshold: 0.4, softness: 0.02, noise: 0.08 } },
      photo,
    ],
  }
  applyLabProjectFile(parseLabProjectFileValue(old), [])
  assert.equal(
    useLayerStore.getState().getLayerById(layer.id).params.darkColor,
    "#000000",
    "Legacy dark default"
  )
  assert.equal(
    useLayerStore.getState().getLayerById(layer.id).params.lightColor,
    "#ffffff",
    "Legacy light default"
  )
  return { samples, png: rendered.png }
}
