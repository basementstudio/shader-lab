import { BlobTrackingPass as RuntimeBlobPass } from "@runtime/renderer/blob-tracking-pass"
import * as THREE from "three/webgpu"
import { BlobTracker, MAX_EDGE_POINTS } from "@/lib/blob-tracking/tracker"
import { glyphIndex, LABEL_CHARS } from "@/renderer/blob-label-atlas"
import {
  BlobTrackingPass,
  formatIdLabel,
  seededLabelHash,
} from "@/renderer/blob-tracking-pass"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const W = 1024
const H = 576
const RX0 = 352
const RX1 = 672
const RY0 = 128
const RY1 = 448

function trackerChecks() {
  const gridW = 64
  const gridH = 36
  const grid = new Uint8Array(gridW * gridH * 4)
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) grid[(y * gridW + x) * 4 + 1] = 255
  }
  fill(4, 4, 19, 19)
  fill(40, 20, 59, 31)
  const tracker = new BlobTracker()
  const config = {
    blobAmount: 4,
    detectionMode: "luminance",
    minBlobSize: 2,
    motionThreshold: 0.12,
    persistentTracking: true,
    sensitivity: 0.5,
    smoothing: 0,
  }
  tracker.step(grid, gridW, gridH, 0, config)
  const blobs = tracker.getBlobs()
  assert(blobs.length === 2, `Two blobs detected (${blobs.length})`)
  const big = blobs.find((b) => b.area === 256)
  assert(big, "16x16 blob found")
  assert(big.edge.length > 0 && big.edge.length <= MAX_EDGE_POINTS, `Edge points bounded (${big.edge.length})`)
  const perimeter = 16 * 4 - 4
  assert(big.edge.length === MAX_EDGE_POINTS || big.edge.length === perimeter, `Edge points sample the perimeter (${big.edge.length})`)
  for (const point of big.edge) {
    const gx = Math.floor(point.x * gridW)
    const gy = Math.floor(point.y * gridH)
    const onBorder = gx === 4 || gx === 19 || gy === 4 || gy === 19
    assert(gx >= 4 && gx <= 19 && gy >= 4 && gy <= 19 && onBorder, `Edge point lies on the blob border (${gx}, ${gy})`)
  }
  const small = blobs.find((b) => b.area === 240)
  assert(small?.edge.every((p) => p.x > 0.6), "Second blob keeps its own edge points")
  tracker.step(grid, gridW, gridH, 1 / 30, config)
  const again = tracker.getBlobs()
  assert(again.length === 2 && again.every((b) => b.edge.length > 0), "Persistent tracks refresh edge points")

  const reference = seededLabelHash(7, 3)
  assert(reference === seededLabelHash(7, 3), "Hash is deterministic")
  assert(reference !== seededLabelHash(8, 3) && reference !== seededLabelHash(7, 4), "Hash depends on seed and id")
  const label = formatIdLabel("person", 7, 3)
  assert(/^PERSON \d\d[0-9A-Z]{2}$/.test(label), `ID label format (${label})`)
  assert(formatIdLabel("person", 7, 3) === label, "ID labels are stable")
  assert([...label].every((char) => glyphIndex(char) >= 0), "Every ID label glyph exists in the atlas")
  for (const char of "PERSON TARGET NOT FOUND x:12 y:34 UNKNOWN_01 [A]/%")
    assert(glyphIndex(char) >= 0, `Atlas is missing ${JSON.stringify(char)}`)
  assert(glyphIndex("é") < 0, "Unknown characters stay blank")
  assert(new Set([...LABEL_CHARS]).size === LABEL_CHARS.length, "Atlas characters are unique")
  return 12
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const data = new Float32Array(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const lit = x >= RX0 && x < RX1 && y >= RY0 && y < RY1
      data.set([lit ? 1 : 0, lit ? 1 : 0, lit ? 1 : 0, 1], (y * W + x) * 4)
    }
  const input = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  const base = {
    ...createLayer("blob-tracking").params,
    detectionMode: "luminance",
    sensitivity: 0.5,
    blobAmount: 4,
    minBlobSize: 2,
    persistentTracking: false,
    connectLines: false,
    centerShape: "none",
    showLabels: false,
    trailDecay: 0,
    strokeWidth: 2,
    shapeScale: 1,
    strokeColor: "#ff0000",
  }
  const renders = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", BlobTrackingPass],
      ["runtime", RuntimeBlobPass],
    ]) {
      const pass = new Pass(`${name}-blob`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      pass.resize(W, H)
      pass.updateLogicalSize(W, H)
      const paint = async (params, label) => {
        pass.updateParams({ ...base, ...params })
        for (let frame = 0; frame < 4; frame++) {
          pass.render(renderer, input, target, frame / 30, 1 / 30, frame / 30)
          if (pass.pendingReadback) await pass.pendingReadback
        }
        pass.render(renderer, input, target, 0.15, 1 / 30, 0.15)
        if (pass.pendingReadback) await pass.pendingReadback
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
        renders[label] ??= {}
        renders[label][name] = pixels
        samples++
        const red = (i) => (pixels[i] > 0.5 && pixels[i + 1] < 0.5 ? 1 : 0)
        const alpha = (x, y) => red((y * W + x) * 4)
        let lit = 0
        const bounds = { x0: W, y0: H, x1: -1, y1: -1 }
        for (let i = 0; i < pixels.length; i += 4) {
          if (!red(i)) continue
          lit++
          const px = (i / 4) % W
          const py = Math.floor(i / 4 / W)
          bounds.x0 = Math.min(bounds.x0, px)
          bounds.x1 = Math.max(bounds.x1, px)
          bounds.y0 = Math.min(bounds.y0, py)
          bounds.y1 = Math.max(bounds.y1, py)
        }
        return { alpha, lit, bounds: JSON.stringify(bounds) }
      }
      const outline = await paint({ frameStyle: "outline" }, "outline")
      assert(outline.lit > 100, `${name}: outline draws a frame (${outline.lit})`)
      const cx = (RX0 + RX1) / 2
      const cy = (RY0 + RY1) / 2
      const probe = (at, points) => Math.max(...points.map(([x, y]) => at(x, y)))
      const topPoints = [-3, -2, -1, 0, 1, 2].map((d) => [cx, RY0 + d])
      const leftPoints = [-3, -2, -1, 0, 1, 2].map((d) => [RX0 + d, cy])
      const midTop = probe(outline.alpha, topPoints)
      const midLeft = probe(outline.alpha, leftPoints)
      assert(midTop > 0.5 && midLeft > 0.5, `${name}: outline covers edge midpoints (${midTop}, ${midLeft}) lit=${outline.lit} bounds=${outline.bounds}`)

      const brackets = await paint({ frameStyle: "brackets", bracketLength: 0.25 }, "brackets")
      assert(brackets.lit > 20 && brackets.lit < outline.lit, `${name}: brackets draw less than the outline (${brackets.lit} vs ${outline.lit})`)
      const bMidTop = probe(brackets.alpha, topPoints)
      const bMidLeft = probe(brackets.alpha, leftPoints)
      assert(bMidTop < 0.05 && bMidLeft < 0.05, `${name}: brackets leave edge midpoints open (${bMidTop}, ${bMidLeft})`)
      let cornerLit = 0
      for (const [kx, ky] of [[RX0, RY0], [RX1 - 1, RY0], [RX0, RY1 - 1], [RX1 - 1, RY1 - 1]])
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++)
            if (brackets.alpha(kx + dx, ky + dy) > 0.5) cornerLit++
      assert(cornerLit >= 8, `${name}: brackets sit on the corners (${cornerLit})`)

      const none = await paint({ frameStyle: "none" }, "none")
      assert(none.lit === 0, `${name}: frame none draws nothing (${none.lit})`)
      const legacyOff = await paint({ frameStyle: undefined, showOutline: false }, "legacy showOutline off")
      assert(legacyOff.lit === 0, `${name}: legacy showOutline=false still hides the frame`)

      const dots = await paint({ frameStyle: "none", edgeDots: 1, dotSize: 2 }, "edge dots")
      assert(dots.lit > 20, `${name}: edge dots render (${dots.lit})`)
      let interior = 0
      for (let y = RY0 + 80; y < RY1 - 80; y++) for (let x = RX0 + 80; x < RX1 - 80; x++) if (dots.alpha(x, y) > 0.5) interior++
      assert(interior === 0, `${name}: edge dots avoid the blob interior (${interior})`)
      let nearEdge = 0
      let farAway = 0
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (dots.alpha(x, y) <= 0.5) continue
          const inside = x >= RX0 - 32 && x < RX1 + 32 && y >= RY0 - 32 && y < RY1 + 32
          if (inside) nearEdge++
          else farAway++
        }
      assert(nearEdge > 0 && farAway === 0, `${name}: dots hug the silhouette (${nearEdge}, ${farAway})`)
      const sparse = await paint({ frameStyle: "none", edgeDots: 0.25, dotSize: 2 }, "sparse dots")
      assert(sparse.lit > 0 && sparse.lit < dots.lit, `${name}: density thins the dots (${sparse.lit} vs ${dots.lit})`)

      const idLabels = await paint({ frameStyle: "none", showLabels: true, labelMode: "id", labelPrefix: "PERSON", labelSeed: 7 }, "id labels")
      assert(idLabels.lit > 20, `${name}: ID labels render ink (${idLabels.lit})`)
      const custom = await paint({ frameStyle: "none", showLabels: true, labelMode: "custom", labelList: "ALPHA\nBETA", labelSeed: 3 }, "custom labels")
      assert(custom.lit > 20, `${name}: custom labels render ink (${custom.lit})`)
      const coords = await paint({ frameStyle: "none", showLabels: true, labelMode: "coordinates" }, "coordinate labels")
      assert(coords.lit > 20, `${name}: coordinate labels still render (${coords.lit})`)
      if (pass.pendingReadback) await pass.pendingReadback
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(renders)) {
      if (label.includes("labels")) continue
      let diff = 0
      for (let i = 0; i < entry.editor.length; i++) diff = Math.max(diff, Math.abs(entry.editor[i] - entry.runtime[i]))
      assert(diff < 0.02, `parity: ${label} differs by ${diff}`)
      samples++
    }
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
  }
  return samples
}

export async function checkBlobTracking() {
  let samples = trackerChecks()
  samples += await passChecks()
  const fresh = createLayer("blob-tracking")
  assert(fresh.params.frameStyle === "outline" && fresh.params.labelMode === "coordinates" && fresh.params.edgeDots === 0, "New blob layers keep the legacy look")
  assert(fresh.params.trailDecay === 0 && fresh.params.squareShapes === true, "New blob layers start without trails and locked to 1:1")
  const legacy = { ...createLayer("blob-tracking"), id: "blob" }
  delete legacy.params.frameStyle
  delete legacy.params.bracketLength
  delete legacy.params.labelMode
  delete legacy.params.edgeDots
  delete legacy.params.squareShapes
  legacy.params.showOutline = false
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [legacy],
    selectedLayerId: null,
    composition: { width: 128, height: 72 },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const hydrated = useLayerStore.getState().getLayerById("blob").params
  assert(hydrated.frameStyle === "none" && hydrated.labelMode === "coordinates" && hydrated.edgeDots === 0, `Legacy showOutline=false migrates to frame none (${hydrated.frameStyle})`)
  assert(hydrated.squareShapes === false, "Legacy layers keep free aspect instead of the new 1:1 default")
  legacy.params.showOutline = true
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  assert(useLayerStore.getState().getLayerById("blob").params.frameStyle === "outline", "Legacy showOutline=true migrates to outline")
  useLayerStore.getState().updateLayerParam("blob", "labelList", "one\ntwo")
  useLayerStore.getState().updateLayerParam("blob", "labelMode", "custom")
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = useLayerStore.getState().getLayerById("blob").params
  assert(reopened.labelList === "one\ntwo" && reopened.labelMode === "custom", "Save/reopen keeps label settings")
  samples += 4
  return { samples }
}
