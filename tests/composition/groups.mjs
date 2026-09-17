import { PipelineManager as RuntimePipeline } from "@runtime/renderer/pipeline-manager"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import {
  flattenComposition as flattenRuntime,
  reverseComposition as reverseRuntime,
} from "@runtime/renderer/composition-tree"
import { texture } from "three/tsl"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import {
  flattenComposition,
  reverseComposition,
} from "@/renderer/composition-tree"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
import { PipelineManager as EditorPipeline } from "@/renderer/pipeline-manager"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

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
      : { layer: node, params: node.params, asset: node.testAsset ?? null }
  )
}

const red = solid("red", "#ff0000", 0.5)
const green = solid("green", "#00ff00", 0.5)
const blue = solid("blue", "#0000ff")
const effect = {
  ...createLayer("threshold"),
  id: "threshold",
  params: { threshold: 0.1, softness: 0.01, noise: 0 },
}

// All arrays below use sidebar order (top first), including group children.
const cases = [
  ["isolated effect", [group("g", [effect, red]), blue], [0.5, 0.5, 1, 1]],
  ["empty group", [group("g", []), blue], [0, 0, 1, 1]],
  [
    "effect-only group cannot see the scene",
    [group("g", [effect]), blue],
    [0, 0, 1, 1],
  ],
  [
    "hidden group",
    [group("g", [effect, red], { visible: false }), blue],
    [0, 0, 1, 1],
  ],
  [
    "zero group opacity",
    [group("g", [effect, red], { opacity: 0 }), blue],
    [0, 0, 1, 1],
  ],
  [
    "opacity applies after children combine",
    [group("g", [green, red], { opacity: 0.5 }), blue],
    [0.125, 0.25, 0.625, 1],
  ],
  [
    "child order",
    [group("g", [red, green], { opacity: 0.5 }), blue],
    [0.25, 0.125, 0.625, 1],
  ],
  [
    "hidden child",
    [group("g", [{ ...green, visible: false }, red]), blue],
    [0.5, 0, 0.5, 1],
  ],
  [
    "nested group opacity",
    [
      group("outer", [group("g", [red], { opacity: 0.5 })], { opacity: 0.5 }),
      blue,
    ],
    [0.125, 0, 0.875, 1],
  ],
  [
    "sibling effects stay isolated",
    [group("g2", [green]), group("g", [effect, red]), blue],
    [0.25, 0.75, 0.5, 1],
  ],
  [
    "external top layer stays unaffected",
    [green, group("g", [effect, red]), blue],
    [0.25, 0.75, 0.5, 1],
  ],
  [
    "parent effect processes combined child",
    [group("outer", [effect, group("g", [red])]), blue],
    [0.5, 0.5, 1, 1],
  ],
  [
    "group blend mode",
    [group("g", [red], { blendMode: "multiply" }), blue],
    [0, 0, 0.5, 1],
  ],
  [
    "group reorder below backdrop",
    [blue, group("g", [effect, red])],
    [0, 0, 1, 1],
  ],
  [
    "move effect outside group",
    [effect, group("g", [red]), blue],
    [1, 1, 1, 1],
  ],
  ["ungroup", [green, red, blue], [0.25, 0.5, 0.25, 1]],
]

export async function checkGroups() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setSize(4, 4, false)
  renderer.setClearColor(0x123456, 0.37)
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
  const output = new THREE.RenderTarget(4, 4, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const read = async (input) => {
    material.colorNode = texture(input)
    material.needsUpdate = true
    renderer.setRenderTarget(output)
    renderer.render(scene, camera)
    // Read rows separately: this Three backend includes GPU row padding in
    // multi-row readbacks whose width is not aligned to 256 bytes.
    const rows = await Promise.all(
      Array.from({ length: output.height }, async (_, y) =>
        Array.from(
          await renderer.readRenderTargetPixelsAsync(
            output,
            0,
            y,
            output.width,
            1
          )
        )
      )
    )
    return rows.flat()
  }
  let samples = 0
  try {
    for (const [name, Pipeline, reverse, flatten] of [
      ["editor", EditorPipeline, reverseComposition, flattenComposition],
      ["runtime", RuntimePipeline, reverseRuntime, flattenRuntime],
    ]) {
      const pipeline = new Pipeline(renderer, { width: 4, height: 4 })
      const nodesFor = (nodes) =>
        name === "editor" ? editorNodes(nodes) : nodes
      const paint = async (nodes) => {
        pipeline.syncLayers(reverse(nodesFor(nodes)))
        await settle()
        let result
        if (name === "runtime") result = pipeline.renderToTexture(0, 0)
        else {
          pipeline.render(0, 0, 2)
          // Inspect the same texture the editor blits to its canvas.
          result = pipeline.blitInputNode.value
        }
        return read(result)
      }
      try {
        for (const [label, nodes, expected] of cases) {
          const actual = await paint(nodes)
          for (let i = 0; i < actual.length; i += 4)
            close(actual.slice(i, i + 4), expected, `${name}: ${label}`)
          samples++
        }
        const restoredColor = renderer.getClearColor(new THREE.Color())
        assert(
          restoredColor.getHex() === 0x123456 &&
            renderer.getClearAlpha() === 0.37,
          `${name}: group changed shared renderer clear settings`
        )
        samples++

        // Reparent existing passes, rather than restarting their media or simulation.
        await paint([red, blue])
        const redPass = pipeline.passMap.get("red")
        await paint([group("g", [red]), blue])
        assert(
          pipeline.passMap.get("red") === redPass,
          `${name}: reparent recreated child pass`
        )
        const groupPass = pipeline.passMap.get("g")
        const disposed = new Set()
        for (const [label, resource] of [
          ["a", groupPass.rtA],
          ["b", groupPass.rtB],
          ["material", groupPass.material],
        ]) {
          resource.addEventListener("dispose", () => disposed.add(label))
        }

        pipeline.resize({ width: 8, height: 6 })
        output.setSize(8, 6)
        close(
          (await paint([group("g", [red]), blue])).slice(0, 4),
          [0.5, 0, 0.5, 1],
          `${name}: resized group`
        )
        assert(
          groupPass.rtA.width === 8 && groupPass.rtB.height === 6,
          `${name}: group targets did not resize`
        )
        disposed.clear()
        await paint([red, blue])
        assert(
          disposed.size === 3,
          `${name}: removed group leaked GPU resources`
        )
        assert(
          pipeline.passMap.get("red") === redPass,
          `${name}: ungroup disposed child`
        )
        samples += 3

        // Animation is discovered through nested groups, but hidden parents stop it.
        await paint([group("g", [red]), blue])
        const child = pipeline.passMap.get("red")
        child.needsContinuousRender = () => true
        assert(
          pipeline.passMap.get("g").needsContinuousRender(),
          `${name}: animation did not propagate`
        )
        if (name === "editor") {
          const times = []
          child.prepareForExportFrame = async (...args) => {
            times.push(args)
          }
          await pipeline.prepareForExportFrame(1.25, true)
          assert(
            times[0]?.[0] === 1.25 && times[0]?.[1] === true,
            "Nested export preparation lost time/loop"
          )
          await paint([group("g", [red], { visible: false }), blue])
          await pipeline.prepareForExportFrame(2, true)
          assert(times.length === 1, "Hidden group prepared media for export")
        }
        await paint([group("g", [red], { visible: false }), blue])
        assert(
          !pipeline.render(0, 0),
          `${name}: hidden group kept animation running`
        )
        samples++

        const duplicates = [group("g", [red]), red]
        let rejected = false
        try {
          pipeline.syncLayers(reverse(nodesFor(duplicates)))
        } catch {
          rejected = true
        }
        assert(rejected, `${name}: duplicate IDs were accepted`)
        // Validation must happen before disposing any current passes.
        assert(
          pipeline.passMap.get("red") === child,
          `${name}: invalid tree mutated live passes`
        )
        let nested = red
        for (let i = 0; i < 8; i++) nested = group(`depth-${i}`, [nested])
        flatten(nodesFor([nested]), (entry) =>
          name === "editor" ? entry.layer.id : entry.id
        )
        rejected = false
        try {
          reverse(nodesFor([group("too-deep", [nested])]))
        } catch {
          rejected = true
        }
        assert(rejected, `${name}: excessive depth was accepted`)
        samples += 2

        if (name === "runtime") {
          const input = new THREE.DataTexture(
            new Float32Array([0, 0, 1, 0.5]),
            1,
            1,
            THREE.RGBAFormat,
            THREE.FloatType
          )
          input.needsUpdate = true
          try {
            pipeline.syncLayers(reverse([group("g", [red])]))
            await settle()
            const pixel = (
              await read(pipeline.renderToTexture(0, 0, input))
            ).slice(0, 4)
            close(
              pixel,
              [2 / 3, 0, 1 / 3, 0.75],
              "Runtime group over transparent external input"
            )
            samples++
          } finally {
            input.dispose()
          }
        }
      } finally {
        pipeline.dispose()
        output.setSize(4, 4)
      }
    }

    const headless = createHeadlessRenderer({
      renderer,
      size: { width: 4, height: 4 },
    })
    try {
      await headless.initialize()
      const frame = {
        clock: { time: 0, delta: 0, duration: 1, loop: true },
        layers: [
          group("outer", [group("inner", [green, red], { opacity: 0.5 })]),
          blue,
        ],
        viewportSize: { width: 4, height: 4 },
        outputSize: { width: 4, height: 4 },
        logicalSize: { width: 4, height: 4 },
        pixelRatio: 1,
      }
      headless.render(frame)
      await settle()
      close(
        (await read(headless.render(frame))).slice(0, 4),
        [0.125, 0.25, 0.625, 1],
        "Headless entry point reverses nested children"
      )
      samples++
    } finally {
      headless.dispose()
    }
  } finally {
    output.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
  }

  // The real editor entry point must preserve ordering at every depth and match
  // its PNG export. The photograph fixture includes clear and soft-alpha regions.
  const size = { width: 64, height: 48 }
  const image = { ...createLayer("image"), id: "photo" }
  image.params = {
    ...image.params,
    scale: 0.5,
    transparentBounds: true,
    fitMode: "contain",
  }
  image.testAsset = {
    id: "fixture",
    kind: "image",
    url: "/scenes/default/alpha-sample.svg",
    width: 160,
    height: 160,
    fileName: "alpha-sample.svg",
  }
  const canvas = document.createElement("canvas")
  const editor = await createWebGPURenderer(canvas, {
    strictPassFailures: true,
  })
  let png
  try {
    await editor.initialize()
    editor.resize(size, 1)
    const frame = {
      clock: {
        time: 0,
        timelineTime: 0,
        delta: 0,
        duration: 1,
        loop: true,
        isPlaying: false,
      },
      cropAspectRatio: null,
      logicalSize: size,
      outputSize: size,
      pixelRatio: 1,
      viewportSize: size,
      sceneConfig: DEFAULT_SCENE_CONFIG,
      layers: editorNodes([
        group("outer", [group("portrait", [effect, image])]),
        blue,
      ]),
    }
    editor.render(frame)
    const deadline = performance.now() + 30_000
    while (editor.hasPendingResources()) {
      assert(
        performance.now() < deadline,
        "Grouped editor render did not settle"
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await editor.prepareForExportFrame(0, true)
    editor.render(frame)
    await editor.waitForGpuIdle()
    const snapshot = document.createElement("canvas")
    snapshot.width = size.width
    snapshot.height = size.height
    const ctx = snapshot.getContext("2d", { willReadFrequently: true })
    ctx.drawImage(canvas, 0, 0)
    const preview = ctx.getImageData(0, 0, size.width, size.height).data
    close(
      Array.from(preview.slice(0, 4)),
      [0, 0, 255, 255],
      "Group holes reveal blue background",
      1
    )
    const center = (24 * size.width + 32) * 4
    close(
      Array.from(preview.slice(center, center + 4)),
      [255, 255, 255, 255],
      "Group effect modifies photograph",
      1
    )
    const exported = editor.exportFrame(frame, size)
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.drawImage(exported, 0, 0)
    close(
      Array.from(ctx.getImageData(0, 0, size.width, size.height).data),
      Array.from(preview),
      "Grouped preview/PNG export",
      0
    )
    png = exported.toDataURL("image/png")
    samples += 3

    const snapshotFrame = async (nodes) => {
      const nextFrame = { ...frame, layers: editorNodes(nodes) }
      editor.render(nextFrame)
      while (editor.hasPendingResources()) {
        assert(performance.now() < deadline, "Regrouped image did not settle")
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      editor.render(nextFrame)
      await editor.waitForGpuIdle()
      ctx.clearRect(0, 0, size.width, size.height)
      ctx.drawImage(canvas, 0, 0)
      return Array.from(ctx.getImageData(0, 0, size.width, size.height).data)
    }
    const flatImage = await snapshotFrame([image, blue])
    const groupedImage = await snapshotFrame([
      group("outer", [group("portrait", [image])]),
      blue,
    ])
    close(
      groupedImage,
      flatImage,
      "Nested group retains image orientation and soft alpha edges",
      1
    )
    samples++
  } finally {
    editor.dispose()
    await editor.destroyDevice()
  }
  return { samples, png }
}
