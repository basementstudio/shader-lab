// Start the dev server, then bun tests/composition/model-layer-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

await mkdir(".context/model-layer", { recursive: true })

function boxGlb(animation = null) {
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ]
  const half = [1, 0.35, 0.35]
  const positions = []
  const normals = []
  const indices = []
  for (const [normal, u, v] of faces) {
    const base = positions.length / 3
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let axis = 0; axis < 3; axis++) {
        positions.push((normal[axis] + u[axis] * su + v[axis] * sv) * half[axis])
        normals.push(normal[axis])
      }
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const chunks = [new Float32Array(positions), new Float32Array(normals), new Uint16Array(indices)]
  if (animation) {
    chunks.push(new Float32Array(animation.times), new Float32Array(animation.translations))
  }
  const views = []
  let byteOffset = 0
  for (const chunk of chunks) {
    views.push({ buffer: 0, byteOffset, byteLength: chunk.byteLength })
    byteOffset += Math.ceil(chunk.byteLength / 4) * 4
  }
  const binary = new Uint8Array(byteOffset)
  for (const [index, chunk] of chunks.entries()) {
    binary.set(new Uint8Array(chunk.buffer), views[index].byteOffset)
  }
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Box" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.2, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.5 } }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: half.map((v) => -v), max: half },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  }
  if (animation) {
    json.accessors.push(
      { bufferView: 3, componentType: 5126, count: animation.times.length, type: "SCALAR", min: [animation.times[0]], max: [animation.times.at(-1)] },
      { bufferView: 4, componentType: 5126, count: animation.times.length, type: "VEC3" }
    )
    json.animations = [
      {
        name: animation.name,
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
        samplers: [{ input: 3, output: 4, interpolation: "LINEAR" }],
      },
    ]
  }
  let text = JSON.stringify(json)
  while (text.length % 4) text += " "
  const jsonBytes = new TextEncoder().encode(text)
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength
  const glb = new Uint8Array(total)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  glb.set(jsonBytes, 20)
  const binStart = 20 + jsonBytes.byteLength
  view.setUint32(binStart, binary.byteLength, true)
  view.setUint32(binStart + 4, 0x004e4942, true)
  glb.set(binary, binStart + 8)
  return glb
}

function studioHdr(width, height, rgb) {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`
  const bytes = new Uint8Array(header.length + width * height * 4)
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i)
  const exponent = Math.ceil(Math.log2(Math.max(...rgb))) + 1
  const scale = 256 / 2 ** exponent
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = header.length + pixel * 4
    bytes.set([...rgb.map((value) => Math.round(value * scale)), exponent + 128], offset)
  }
  return bytes
}

await Bun.write(".context/model-layer/ui-box.glb", boxGlb())
await Bun.write(
  ".context/model-layer/ui-slide.glb",
  boxGlb({ name: "Slide", times: [0, 2], translations: [-2, 0, 0, 2, 0, 0] })
)
await Bun.write(".context/model-layer/ui-studio.hdr", studioHdr(64, 32, [2, 1.6, 1.2]))
await Bun.write(
  ".context/model-layer/ui-logo.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#ff4d00" fill-rule="evenodd" d="M10 50 A40 40 0 1 0 90 50 A40 40 0 1 0 10 50 Z M30 50 A20 20 0 1 0 70 50 A20 20 0 1 0 30 50 Z"/></svg>`
)

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-webgpu-adapter=swiftshader",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto(process.env.SHADER_LAB_URL ?? "http://localhost:55000", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  })
  const panel = page.locator('[data-layer-sidebar-panel="true"]:visible')
  await panel.waitFor({ timeout: 120000 })
  await page.waitForTimeout(2000)
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true })
  async function save(name) {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    const downloaded = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export .lab file", exact: true }).click()
    const path = `.context/model-layer/ui-${name}.lab`
    await (await downloaded).saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const modelOf = (project) => project.layers.find((layer) => layer.type === "model")

  const add = panel.getByRole("button", { name: "Add layer", exact: true })
  await add.click()
  const chooser = page.waitForEvent("filechooser")
  await page
    .locator(`[id="${await add.getAttribute("aria-controls")}"]`)
    .getByRole("button", { name: "3D Model", exact: true })
    .click()
  await (await chooser).setFiles(".context/model-layer/ui-box.glb")
  const gizmo = page.locator("[data-model-gizmo]")
  await gizmo.waitFor({ timeout: 60000 })
  await page.waitForTimeout(4000)
  assert.equal(await gizmo.getAttribute("data-model-gizmo"), "rotate", "Rotate gizmo by default")
  const initial = modelOf(await save("initial"))
  assert.equal(initial.params.material, "original")
  assert.deepEqual(initial.params.rotation, [0, 0, 0])

  const body = await page.locator('[data-model-gizmo-handle="body"]').boundingBox()
  const cx = body.x + body.width / 2
  const cy = body.y + body.height / 2
  await page.mouse.move(cx - body.width * 0.3, cy + body.height * 0.25)
  await page.mouse.down()
  await page.mouse.move(cx - body.width * 0.15, cy + body.height * 0.25, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const turned = modelOf(await save("turned"))
  assert.ok(turned.params.rotation.some((value) => Math.abs(value) > 5), `Dragging inside rotates (${turned.params.rotation})`)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.deepEqual(modelOf(await save("turned-undo")).params.rotation, [0, 0, 0], "One drag is one undo step")

  await page.mouse.move(cx + 40, cy + 40)
  await page.keyboard.press("g")
  await page.keyboard.press("x")
  await page.mouse.move(cx + 140, cy + 60, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = modelOf(await save("moved"))
  assert.ok(moved.params.location[0] > 0.1, `G then X moves along X (${moved.params.location})`)
  assert.equal(moved.params.location[1], 0, "X lock keeps Y")
  assert.equal(moved.params.location[2], 0, "X lock keeps Z")

  await page.mouse.move(cx + 120, cy - 60)
  await page.keyboard.press("r")
  await page.keyboard.press("z")
  await page.mouse.move(cx - 60, cy - 120, { steps: 8 })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  assert.deepEqual(modelOf(await save("rotate-cancel")).params.rotation, [0, 0, 0], "Esc cancels a modal rotate")
  await page.mouse.move(cx, cy)
  await page.keyboard.press("Alt+g")
  await page.waitForTimeout(400)
  assert.deepEqual(modelOf(await save("location-cleared")).params.location, [0, 0, 0], "Alt+G clears the location")

  const modelSection = page.locator("[data-model-section]").filter({ visible: true })
  await modelSection.getByRole("button", { name: /^Move/ }).click()
  assert.equal(await gizmo.getAttribute("data-model-gizmo"), "move")
  await page.locator('[data-model-gizmo-handle="move-Y"]').waitFor()
  await modelSection.getByRole("button", { name: /^Scale/ }).click()
  await page.locator('[data-model-gizmo-handle="scale-uniform"]').waitFor()
  const uniform = await page.locator('[data-model-gizmo-handle="scale-uniform"]').boundingBox()
  await page.mouse.move(uniform.x + uniform.width, uniform.y + uniform.height)
  await page.mouse.down()
  await page.mouse.move(uniform.x + uniform.width * 3, uniform.y + uniform.height * 3, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const scaled = modelOf(await save("scaled"))
  assert.ok(
    scaled.params.scale[0] > 1.1 && scaled.params.scale[0] < 2 && scaled.params.scale[0] === scaled.params.scale[2],
    `Uniform scale grows gently from the center (${scaled.params.scale})`
  )

  const hdrChooser = page.waitForEvent("filechooser")
  await modelSection.getByRole("button", { name: "Attach .hdr", exact: true }).click()
  await (await hdrChooser).setFiles(".context/model-layer/ui-studio.hdr")
  await modelSection.getByText("Lit by ui-studio.hdr.").waitFor({ timeout: 30000 })
  const lit = await save("custom-hdr")
  const litModel = modelOf(lit)
  assert.equal(litModel.params.environment, "custom", "Attaching an .hdr selects Custom")
  assert.ok(lit.assets.some((asset) => asset.id === litModel.environmentAssetId && asset.kind === "environment"), "The .hdr is saved with the project")
  await page.waitForTimeout(2000)
  await page.screenshot({ path: ".context/model-layer/ui-model-layer.png" })
  await modelSection.getByRole("button", { name: "Remove", exact: true }).click()
  await page.waitForTimeout(400)
  const removed = modelOf(await save("hdr-removed"))
  assert.equal(removed.params.environment, "studio", "Removing the .hdr returns to the Studio")
  assert.equal(removed.environmentAssetId, null)

  assert.equal(await page.locator("[data-model-animation]").filter({ visible: true }).count(), 0, "Still models show no Animation controls")
  await add.click()
  const slideChooser = page.waitForEvent("filechooser")
  await page
    .locator(`[id="${await add.getAttribute("aria-controls")}"]`)
    .getByRole("button", { name: "3D Model", exact: true })
    .click()
  await (await slideChooser).setFiles(".context/model-layer/ui-slide.glb")
  const animationBlock = page.locator("[data-model-animation]").filter({ visible: true })
  await animationBlock.waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  assert.ok((await animationBlock.innerText()).includes("Slide"), "The clip from the file is listed")
  assert.ok((await animationBlock.innerText()).includes("2.00 s"), "The clip length is shown")
  const animated = await save("animated")
  const slideAsset = animated.assets.find((asset) => asset.fileName === "ui-slide.glb")
  const slideLayer = animated.layers.find((layer) => layer.assetId === slideAsset.id)
  assert.equal(animated.timeline.duration, 2, "Importing an animated model sets the timeline to the clip length")
  await animationBlock.getByRole("switch").first().click()
  await page.waitForTimeout(400)
  const paused = (await save("animation-paused")).layers.find((layer) => layer.id === slideLayer.id)
  assert.equal(paused.params.animationPlaying, false, "Play toggles off")

  await add.click()
  const svgChooser = page.waitForEvent("filechooser")
  await page
    .locator(`[id="${await add.getAttribute("aria-controls")}"]`)
    .getByRole("button", { name: "3D Model", exact: true })
    .click()
  await (await svgChooser).setFiles(".context/model-layer/ui-logo.svg")
  const extrude = page.locator("[data-model-extrude]").filter({ visible: true })
  await extrude.waitFor({ timeout: 60000 })
  assert.equal(await page.locator("[data-model-animation]").filter({ visible: true }).count(), 0, "SVG models have no clips")
  const logo = await save("svg")
  const logoAsset = logo.assets.find((asset) => asset.fileName === "ui-logo.svg")
  assert.equal(logoAsset.kind, "model", "An SVG picked for 3D becomes a model asset")
  assert.equal(logo.layers.find((layer) => layer.assetId === logoAsset.id).params.extrudeDepth, 0.15, "The layer starts with the default depth")
  await page.waitForTimeout(2500)
  await page.screenshot({ path: ".context/model-layer/ui-svg.png" })

  assert.deepEqual(errors, [])
  console.log(
    "PASS 3D model UI: picker import, rotate gizmo, undo granularity, G + axis lock, Esc cancel, Alt+G clear, gizmo modes, uniform scale, custom .hdr attach/remove, save, animated import, clip list, timeline length, play toggle, SVG import, extrude controls"
  )
} finally {
  await browser.close()
}
