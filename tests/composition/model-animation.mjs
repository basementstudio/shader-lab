import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import { MODEL_ENVIRONMENTS } from "@/lib/editor/config/model-options"
import {
  modelClipTime,
  modelSelectionDuration,
  modelSelectionValue,
  parseGltfClips,
  readModelAnimation,
  resolveModelClips,
} from "@/lib/editor/model-animation"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { getSeedableMediaDuration } from "@/lib/editor/timeline-duration"
import { ModelPass } from "@/renderer/model-pass"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import { assetFor, modelLayer, renderLayers } from "./model-layer.mjs"

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

async function exportAnimatedGlb(build) {
  const scene = new THREE.Scene()
  const animations = build(scene)
  const buffer = await new GLTFExporter().parseAsync(scene, { animations, binary: true })
  return new Blob([buffer], { type: "model/gltf-binary" })
}

function red() {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0) })
}

function slidingBox(scene) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), red())
  box.name = "Slider"
  scene.add(box)
  return [
    new THREE.AnimationClip("Slide", 2, [
      new THREE.VectorKeyframeTrack("Slider.position", [0, 2], [-1, 0, 0, 1, 0, 0]),
    ]),
  ]
}

function twoPieces(scene) {
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), red())
  left.name = "Left"
  left.position.set(-1, 0, 0)
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), red())
  right.name = "Right"
  right.position.set(1, 0, 0)
  scene.add(left, right)
  return [
    new THREE.AnimationClip("Lift", 1, [
      new THREE.VectorKeyframeTrack("Left.position", [0, 1], [-1, 0, 0, -1, 1, 0]),
    ]),
    new THREE.AnimationClip("Drop", 1.5, [
      new THREE.VectorKeyframeTrack("Right.position", [0, 1.5], [1, 0, 0, 1, -1, 0]),
    ]),
  ]
}

function sharedClips(scene) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), red())
  box.name = "Walker"
  scene.add(box)
  return [
    new THREE.AnimationClip("Idle", 1, [
      new THREE.VectorKeyframeTrack("Walker.position", [0, 1], [0, 0, 0, 0, 0.2, 0]),
    ]),
    new THREE.AnimationClip("Walk", 1, [
      new THREE.VectorKeyframeTrack("Walker.position", [0, 1], [-1, 0, 0, 1, 0, 0]),
    ]),
  ]
}

function bendingBar(scene) {
  const geometry = new THREE.BoxGeometry(2, 0.3, 0.3, 24, 1, 1)
  const position = geometry.attributes.position
  const indices = []
  const weights = []
  for (let index = 0; index < position.count; index++) {
    indices.push(position.getX(index) > 0 ? 1 : 0, 0, 0, 0)
    weights.push(1, 0, 0, 0)
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4))
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4))
  const root = new THREE.Bone()
  root.name = "Root"
  const tip = new THREE.Bone()
  tip.name = "Tip"
  root.add(tip)
  const mesh = new THREE.SkinnedMesh(geometry, red())
  mesh.name = "Bar"
  mesh.add(root)
  mesh.bind(new THREE.Skeleton([root, tip]))
  scene.add(mesh)
  const bent = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  return [
    new THREE.AnimationClip("Bend", 1, [
      new THREE.QuaternionKeyframeTrack("Tip.quaternion", [0, 1], [0, 0, 0, 1, bent.x, bent.y, bent.z, bent.w]),
    ]),
  ]
}

function unitChecks(clips) {
  const settings = (overrides = {}) => ({ ...readModelAnimation({}), ...overrides })
  near(modelClipTime(settings(), 2.5, 2), 0.5, 1e-9, "Loop wraps past the end")
  near(modelClipTime(settings({ repeat: "pingpong" }), 3, 2), 1, 1e-9, "Ping-pong plays back")
  near(modelClipTime(settings({ repeat: "once" }), 5, 2), 2, 1e-9, "Once holds the last frame")
  near(modelClipTime(settings({ playing: false, start: 0.7 }), 5, 2), 0.7, 1e-9, "Paused holds Start")
  near(modelClipTime(settings({ speed: 2 }), 0.5, 2), 1, 1e-9, "Speed scales time")
  near(modelClipTime(settings({ start: 0.5 }), 0.25, 2), 0.75, 1e-9, "Start offsets time")
  near(modelClipTime(settings(), 1, 0), 0, 1e-9, "Empty clips stay at zero")
  const defaults = readModelAnimation(createLayer("model").params)
  assert(defaults.playing && defaults.speed === 1 && defaults.start === 0 && defaults.repeat === "loop", "Default playback")
  assert(createLayer("model").params.animation === "auto", "Default clip is automatic")

  const [slide, pieces, shared] = clips
  assert(slide.length === 1 && slide[0].name === "Slide", "Clip name read from the file")
  near(slide[0].duration, 2, 1e-4, "Clip duration read from the file")
  assert(pieces.length === 2 && pieces[0].label === "Lift" && pieces[1].label === "Drop", "Two clips read in order")
  assert(resolveModelClips("auto", pieces).join() === "0,1", "Clips on different objects play together")
  assert(resolveModelClips("auto", shared).join() === "0", "Clips on the same object start with the first")
  assert(resolveModelClips("none", pieces).length === 0, "None plays nothing")
  assert(resolveModelClips("all", shared).join() === "0,1", "All plays every clip")
  assert(resolveModelClips("Drop", pieces).join() === "1", "A named clip plays alone")
  assert(resolveModelClips("Gone", shared).join() === "0", "A missing clip falls back to the default")
  assert(modelSelectionValue("auto", pieces) === "all" && modelSelectionValue("auto", shared) === "Idle", "Automatic choice is shown")
  near(modelSelectionDuration("auto", pieces), 1.5, 1e-4, "Timeline length follows the longest playing clip")
  near(getSeedableMediaDuration({ duration: 1.5, kind: "model" }), 1.5, 1e-9, "Animated models seed the timeline")
  assert(getSeedableMediaDuration({ duration: null, kind: "model" }) === null, "Still models leave the timeline alone")
  return 22
}

async function passChecks(urls) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(new Float32Array([0, 0, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const pass = new ModelPass("model-animation", renderer)
  pass.updateCompositionRole("source")
  pass.flushColorNode()
  pass.resize(N, N)
  pass.updateLogicalSize(N, N)
  pass.updateOpacity(1)
  let samples = 0
  const redStats = (pixels) => {
    let count = 0
    let sumX = 0
    let sumY = 0
    let left = 0
    let right = 0
    for (let row = 0; row < N; row++) {
      for (let column = 0; column < N; column++) {
        const i = (row * N + column) * 4
        if (pixels[i] > 0.5 && pixels[i + 2] < 0.5) {
          count++
          sumX += (column + 0.5) / N - 0.5
          sumY += 0.5 - (row + 0.5) / N
          if (column === 0) left++
          if (column === N - 1) right++
        }
      }
    }
    return { count, left, right, x: count ? sumX / count : Number.NaN, y: count ? sumY / count : Number.NaN }
  }
  const render = async (url, time, params = {}) => {
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
    pass.render(renderer, input, target, time, 0)
    pass.render(renderer, input, target, time, 0)
    return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
  }
  const probe = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const probeScene = new THREE.Scene()
  probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probe))
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const depthCoverage = async () => {
    probe.colorNode = texture(pass.getOutputSceneDepth(), vec2(uv().x, float(1).sub(uv().y)))
    probe.needsUpdate = true
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    renderer.setRenderTarget(null)
    const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
    let sum = 0
    let count = 0
    for (let row = 0; row < N; row++) {
      for (let column = 0; column < N; column++) {
        if (pixels[(row * N + column) * 4 + 3] > 0.5) {
          sum += (column + 0.5) / N - 0.5
          count++
        }
      }
    }
    return count ? sum / count : Number.NaN
  }
  try {
    const start = redStats(await render(urls.slide, 0))
    const startDepth = await depthCoverage()
    const middle = redStats(await render(urls.slide, 1))
    const end = redStats(await render(urls.slide, 1.99))
    assert(start.x < -0.15, `The clip starts on the left (${start.x})`)
    near(middle.x, 0, 0.03, "Halfway through the clip the box is centered")
    assert(end.x > 0.15, `The clip ends on the right (${end.x})`)
    assert(start.left === 0 && end.right === 0 && start.count > 20, "Framing covers the whole clip, so nothing leaves the frame")
    near(startDepth, start.x, 0.03, "Depth follows the animated pose")
    samples += 5
    assert(pass.needsContinuousRender(), "A playing clip keeps rendering")
    samples++

    near(redStats(await render(urls.slide, 0.5, { animationSpeed: 2 })).x, middle.x, 0.02, "Double speed reaches the middle in half the time")
    const paused = redStats(await render(urls.slide, 0, { animationPlaying: false, animationStart: 1 })).x
    near(paused, middle.x, 0.02, "Paused shows the Start frame")
    near(redStats(await render(urls.slide, 1.7, { animationPlaying: false, animationStart: 1 })).x, paused, 0.005, "Paused ignores the timeline")
    assert(!pass.needsContinuousRender(), "A paused clip stops continuous rendering")
    near(redStats(await render(urls.slide, 3, { animationRepeat: "once" })).x, end.x, 0.02, "Once holds the last frame")
    near(redStats(await render(urls.slide, 3, { animationRepeat: "pingpong" })).x, middle.x, 0.02, "Ping-pong comes back through the middle")
    near(redStats(await render(urls.slide, 1.5, { animationStart: 0.5 })).x, redStats(await render(urls.slide, 0)).x, 0.02, "Start shifts the clip")
    samples += 7

    const rest = redStats(await render(urls.slide, 1.5, { animation: "none" }))
    near(rest.x, 0, 0.02, "None shows the rest pose")
    assert(rest.count > middle.count * 2, "Without a clip the rest pose is framed on its own")
    assert(!pass.needsContinuousRender(), "A still model does not keep rendering")
    samples += 3

    const piece = (name) => pass.model.getObjectByName(name).position.y
    await render(urls.pieces, 0.75)
    near(piece("Left"), 0.75, 1e-3, "All clips: the first clip moves its piece")
    near(piece("Right"), -0.5, 1e-3, "All clips: the second clip moves its piece")
    await render(urls.pieces, 0.75, { animation: "Lift" })
    near(piece("Right"), 0, 1e-6, "Switching to one clip puts the other piece back at rest")
    samples += 3

    const straight = redStats(await render(urls.bend, 0))
    const bent = redStats(await render(urls.bend, 0.99))
    assert(straight.y < 0.05 && bent.y > straight.y + 0.05, `Skinned meshes bend with their bones (${straight.y} → ${bent.y})`)
    samples++
  } finally {
    probe.dispose()
    pass.dispose()
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
}

async function exportChecks(blob) {
  const asset = assetFor(blob, "slide")
  const layer = modelLayer(asset.id, { floor: false, orbit: 0, elevation: 0, animationSpeed: 1 })
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [{ id: "slide-saved", fileName: "slide.glb", kind: "model" }],
    layers: [
      {
        ...modelLayer("slide-saved"),
        id: "animated",
        params: {
          ...createLayer("model").params,
          animation: "Slide",
          animationPlaying: false,
          animationRepeat: "pingpong",
          animationSpeed: 0.5,
          animationStart: 0.25,
        },
      },
    ],
    selectedLayerId: "animated",
    composition: { width: 64, height: 64 },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 2, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const saved = parseLabProjectFileValue(JSON.parse(JSON.stringify(buildLabProjectFile())))
  const params = saved.layers.find((entry) => entry.id === "animated").params
  assert(
    params.animation === "Slide" && params.animationRepeat === "pingpong" && params.animationSpeed === 0.5 && params.animationStart === 0.25 && params.animationPlaying === false,
    "Animation settings survive save and reopen"
  )
  const pixels = async (time) => {
    const image = new Image()
    image.src = await renderLayers([layer], [asset], { width: 64, height: 64 }, { time, background: "#0000ff" })
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext("2d")
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, 64, 64).data
    let sum = 0
    let count = 0
    for (let index = 0; index < 64 * 64; index++) {
      if (data[index * 4] > 128 && data[index * 4 + 2] < 128) {
        sum += ((index % 64) + 0.5) / 64 - 0.5
        count++
      }
    }
    return sum / count
  }
  const early = await pixels(0.2)
  const late = await pixels(1.8)
  assert(early < -0.1 && late > 0.1, `Exported frames follow the clip (${early} → ${late})`)
  return 2
}

export async function checkModelAnimation() {
  const blobs = {
    bend: await exportAnimatedGlb(bendingBar),
    pieces: await exportAnimatedGlb(twoPieces),
    shared: await exportAnimatedGlb(sharedClips),
    slide: await exportAnimatedGlb(slidingBox),
  }
  const clips = await Promise.all(
    [blobs.slide, blobs.pieces, blobs.shared].map(async (blob) => parseGltfClips(await blob.arrayBuffer()))
  )
  let samples = unitChecks(clips)
  const urls = Object.fromEntries(Object.entries(blobs).map(([key, blob]) => [key, URL.createObjectURL(blob)]))
  samples += await passChecks(urls)
  samples += await exportChecks(blobs.slide)
  return samples
}
