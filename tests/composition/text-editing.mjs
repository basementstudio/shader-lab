import { TextPass as RuntimeTextPass } from "@runtime/renderer/text-pass"
import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import {
  offsetFromPivotUnits,
  textPivotUnits,
} from "@/lib/editor/text-geometry"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { splitTextLines } from "@/renderer/text-layout"
import { TextPass } from "@/renderer/text-pass"
import { useLayerStore } from "@/store/layer-store"
import {
  canEditTextLayer,
  findTextLayerToEdit,
} from "@/store/text-edit-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const W = 256
const H = 192
const base = {
  text: "V3",
  fontFamily: "mono",
  fontWeight: 400,
  fontSize: 64,
  letterSpacing: 0,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundAlpha: 0,
  anchor: "center",
  offset: [0, 0],
}

function coverage(pixels) {
  const rows = new Set()
  const cols = new Set()
  let count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0.5) {
      count++
      const p = i / 4
      rows.add(Math.floor(p / W))
      cols.add(p % W)
    }
  }
  const sorted = (set) => [...set].sort((a, b) => a - b)
  const r = sorted(rows)
  const c = sorted(cols)
  return {
    count,
    top: r[0] ?? -1,
    bottom: r.at(-1) ?? -1,
    left: c[0] ?? -1,
    right: c.at(-1) ?? -1,
    rows: r,
  }
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false })
  const renders = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", TextPass],
      ["runtime", RuntimeTextPass],
    ]) {
      const pass = new Pass(`${name}-text`)
      pass.resize(W, H)
      pass.updateLogicalSize(W, H)
      pass.updateCompositionRole("source")
      pass.flushColorNode()
      const paint = async (params) => {
        pass.updateParams({ ...base, ...params })
        pass.updateOpacity(1)
        pass.render(renderer, input, target, 0, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H))
      }
      const record = (label, pixels) => {
        renders[label] ??= {}
        renders[label][name] = pixels
        samples++
        return coverage(pixels)
      }
      const legacy = record("legacy single line", await paint({}))
      const explicit = record(
        "explicit defaults",
        await paint({ align: "auto", lineHeight: 1.1, rotation: 0 })
      )
      assert(
        legacy.count > 50 && explicit.count === legacy.count && explicit.top === legacy.top,
        `${name}: default multiline params must not change single-line output`
      )
      const two = record("two lines", await paint({ text: "V3\nV3" }))
      assert(two.count > legacy.count * 1.6, `${name}: second line adds glyphs (${two.count} vs ${legacy.count})`)
      assert(two.top < legacy.top && two.bottom > legacy.bottom, `${name}: two lines extend above and below`)
      const gaps = two.rows.some((row, i) => i > 0 && row - two.rows[i - 1] > 3)
      assert(gaps, `${name}: lines are separated by a gap`)
      const tight = record("tight line height", await paint({ text: "V3\nV3", lineHeight: 0.7 }))
      assert(tight.bottom - tight.top < two.bottom - two.top, `${name}: line height shrinks the block`)
      const top = record("top anchor two lines", await paint({ text: "V3\nV3", anchor: "top-center" }))
      assert(top.top <= 2 && top.bottom < H * 0.7, `${name}: top-anchored block starts at the top edge (${top.top}, ${top.bottom})`)
      const bottom = record("bottom anchor two lines", await paint({ text: "V3\nV3", anchor: "bottom-center" }))
      assert(bottom.bottom >= H - 3 && bottom.top > H * 0.3, `${name}: bottom-anchored block ends at the bottom edge (${bottom.top}, ${bottom.bottom})`)
      const left = record("align left", await paint({ text: "V3\nV3V3", align: "left", anchor: "center-left" }))
      const ragged = record("ragged center", await paint({ text: "V3\nV3V3", anchor: "center" }))
      assert(left.left <= 2, `${name}: left alignment starts at the left edge`)
      assert(ragged.left > 20, `${name}: centered ragged lines are centered`)
      const forcedLeft = record("forced left at center anchor", await paint({ text: "V3\nV3V3", align: "left" }))
      assert(forcedLeft.left > ragged.left + 20 && Math.abs(forcedLeft.left - W / 2) < 10, `${name}: explicit Align overrides the anchor's horizontal (${forcedLeft.left} vs ragged ${ragged.left})`)
      const rotated = record("rotated", await paint({ rotation: 90 }))
      assert(
        rotated.bottom - rotated.top > legacy.bottom - legacy.top + 10 &&
          rotated.right - rotated.left < legacy.right - legacy.left - 10,
        `${name}: 90° rotation swaps the glyph extents`
      )
      const centered = Math.abs((rotated.left + rotated.right) / 2 - W / 2) < 6 && Math.abs((rotated.top + rotated.bottom) / 2 - H / 2) < 6
      assert(centered, `${name}: rotation pivots around the anchor`)
      const small = record("small font", await paint({ fontSize: 12 }))
      assert(small.count > 10 && small.bottom - small.top < 16, `${name}: 12px text renders below the old 48px minimum (${small.bottom - small.top})`)
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(renders)) {
      assert(entry.editor.length === entry.runtime.length, `parity size: ${label}`)
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

export async function checkTextEditing(renderProject) {
  assert(splitTextLines("a\r\nb\nc").length === 3, "Line splitting")
  const logical = { width: 1920, height: 1080 }
  const params = { ...createLayer("text").params, anchor: "top-left", offset: [0.25, -0.5] }
  const units = textPivotUnits(params, logical)
  const back = offsetFromPivotUnits(params, logical, units)
  assert(Math.abs(back[0] - 0.25) < 1e-3 && Math.abs(back[1] + 0.5) < 1e-3, `Offset roundtrip (${back})`)
  const centered = textPivotUnits({ ...params, anchor: "center", offset: [0, 0] }, logical)
  assert(Math.abs(centered[0]) < 1e-9 && Math.abs(centered[1]) < 1e-9, "Center anchor pivots at origin")
  const upward = textPivotUnits({ ...params, anchor: "center", offset: [0, 0.25] }, logical)
  assert(upward[1] < 0, "Positive offset y moves up (negative units)")
  const fresh = createLayer("text")
  assert(fresh.params.align === "auto" && fresh.params.lineHeight === 1.1 && fresh.params.rotation === 0, "New text defaults")
  let samples = 5
  samples += await passChecks()

  const text = { ...createLayer("text"), id: "headline", params: { ...createLayer("text").params, ...base, text: "Line one\nLine two", rotation: -12, align: "left", fontSize: 20 } }
  const locked = { ...createLayer("text"), id: "locked", locked: true }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [locked, text],
    selectedLayerId: null,
    composition: { width: W, height: H },
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#2468cc" },
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const layers = useLayerStore.getState().layers
  assert(!canEditTextLayer(layers, "locked"), "Locked text is not editable")
  assert(findTextLayerToEdit(layers, null) === "headline", "Double-click picks the first editable text layer")
  assert(findTextLayerToEdit(layers, "headline") === "headline", "Selected text wins")
  const saved = buildLabProjectFile()
  useLayerStore.getState().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const restored = reopened.layers.find((l) => l.id === "headline")
  assert(
    restored.params.text === "Line one\nLine two" && restored.params.rotation === -12 && restored.params.fontSize === 20 && restored.params.align === "left",
    "Save/reopen lost multiline text settings"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === "headline").params.text.includes("\n"), "Export keeps newlines")
  const first = await renderProject(saved)
  const again = await renderProject(reopened)
  let diff = 0
  for (let i = 0; i < first.image.data.length; i++) diff = Math.max(diff, Math.abs(first.image.data[i] - again.image.data[i]))
  assert(diff === 0, "Reopened text pixels")
  let lit = 0
  for (let i = 0; i < first.image.data.length; i += 4) if (first.image.data[i] > 200 && first.image.data[i + 1] > 200) lit++
  assert(lit > 40, "Rendered small rotated multiline text is visible")
  samples += 6
  return { samples, png: first.png }
}
