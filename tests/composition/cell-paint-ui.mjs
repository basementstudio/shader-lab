// Start the dev server, then bun tests/composition/cell-paint-ui.mjs.
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import { decodeCellPaintMask } from "@/renderer/cell-paint-mask"
import { mkdir } from "node:fs/promises"
await mkdir(".context", { recursive: true })
const group = {
  ...createLayer("group"),
  id: "group",
  name: "Photographic study",
}
const cells = {
  ...createLayer("photographic-cells"),
  id: "cells",
  parentId: group.id,
}
const photo = { ...createLayer("image"), id: "photo-layer", parentId: group.id }
await Bun.write(
  ".context/paint-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: cells.id,
    assets: [],
    layers: [group, cells, photo],
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#f5f2ee" },
    timeline: { duration: 5, loop: true, tracks: [] },
  })
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
  await page.goto(process.env.SHADER_LAB_URL ?? "http://localhost:55000", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  })
  const panel = page.locator('[data-layer-sidebar-panel="true"]:visible')
  await panel.waitFor({ timeout: 120000 })
  async function ready() {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[class*="loader-bounce"]')].every(
          (loader) => {
            for (let node = loader; node; node = node.parentElement) {
              const style = getComputedStyle(node)
              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                Number(style.opacity) === 0
              )
                return true
            }
            return false
          }
        ),
      null,
      { timeout: 120000 }
    )
  }
  await ready()
  await page
    .getByRole("button", { name: "Export", exact: true })
    .filter({ visible: true })
    .click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page
    .locator('input[accept=".lab,application/json"]')
    .last()
    .setInputFiles(".context/paint-ui-fixture.lab")
  await panel.locator('[data-layer-row="cells"]').waitFor()
  await ready()
  await panel
    .locator('[data-layer-row="photo-layer"]')
    .getByText("Image", { exact: true })
    .click()
  const chooser = page.waitForEvent("filechooser")
  const add = panel.getByRole("button", { name: "Add layer", exact: true })
  await add.click()
  const menu = await add.getAttribute("aria-controls")
  await page
    .locator(`[id="${menu}"]`)
    .getByRole("button", { name: /^Image$/ })
    .click()
  await (await chooser).setFiles("public/examples/slice.webp")
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-layer-sidebar-panel="true"] [data-layer-row]'
      ).length >= 4
  )
  await panel
    .locator('[data-layer-row="photo-layer"]')
    .getByRole("button", { name: "Delete Image", exact: true })
    .click()
  await panel
    .locator('[data-layer-row="cells"]')
    .getByText("Photographic Cells", { exact: true })
    .click()
  await ready()

  await page
    .getByRole("combobox")
    .filter({ hasText: /^Regions$/ })
    .click()
  await page.getByRole("option", { name: "Paint", exact: true }).click()
  assert.equal(
    await page.getByRole("slider", { name: /^Threshold/ }).count(),
    0
  )
  const overlay = page.locator('[data-cell-paint-overlay="true"]')
  await overlay.waitFor()
  await page
    .getByRole("button", { name: "Done Painting", exact: true })
    .waitFor()
  await page
    .getByRole("combobox")
    .filter({ hasText: /^Paint$/ })
    .click()
  await page.getByRole("option", { name: "Regions", exact: true }).click()
  await overlay.waitFor({ state: "hidden" })
  await page
    .getByRole("combobox")
    .filter({ hasText: /^Regions$/ })
    .click()
  await page.getByRole("option", { name: "Paint", exact: true }).click()
  await overlay.waitFor()
  await page.getByRole("button", { name: "Done Painting", exact: true }).click()
  await overlay.waitFor({ state: "hidden" })
  await page.getByRole("button", { name: "Edit Paint", exact: true }).click()
  await overlay.waitFor()
  const box = await overlay.boundingBox()
  const x = box.x + box.width * 0.45
  const y = box.y + box.height * 0.45
  async function stroke(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    // An unrelated touch cancellation must not discard the captured stroke.
    await overlay.dispatchEvent("pointercancel", {
      pointerId: 99,
      pointerType: "touch",
    })
    await page.mouse.move(x2, y2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(350)
  }
  async function save(name) {
    await page
      .getByRole("button", { name: "Export", exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    const downloaded = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Export .lab file", exact: true })
      .click()
    const download = await downloaded
    const path = `.context/paint-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const mask = (project) =>
    Bun.hash(project.layers.find((l) => l.id === "cells").params.paintMask)
  await stroke(x, y, x + 100, y + 70)
  const first = await save("first")
  assert.ok(
    first.layers
      .find((l) => l.id === "cells")
      .params.paintMask.startsWith("pc1:")
  )
  assert.ok(!JSON.stringify(first).includes("_paintGuide"))
  await stroke(x + 150, y - 80, x + 210, y - 120)
  const second = await save("second")
  assert.notEqual(mask(first), mask(second))
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(350)
  assert.equal(
    mask(await save("undo")),
    mask(first),
    "Undo removes exactly one stroke"
  )
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(350)
  assert.equal(mask(await save("redo")), mask(second), "Redo restores stroke")
  await page
    .getByRole("combobox")
    .filter({ hasText: /^Reveal$/ })
    .click()
  await page.getByRole("option", { name: "Erase", exact: true }).click()
  await stroke(x, y, x + 35, y + 35)
  const erased = await save("erased")
  assert.notEqual(mask(erased), mask(second))
  await page.mouse.move(x - 90, y)
  await page.mouse.down()
  await page.mouse.move(x - 80, y + 30)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  assert.equal(
    mask(await save("cancel")),
    mask(erased),
    "Escape committed cancelled stroke"
  )
  await page.getByRole("button", { name: "Edit Paint", exact: true }).click()
  await page.getByRole("button", { name: "Clear Paint", exact: true }).click()
  await page.waitForTimeout(350)
  assert.equal(mask(await save("clear")), Bun.hash(""))
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(350)
  assert.equal(
    mask(await save("clear-undo")),
    mask(erased),
    "Clear cannot be undone"
  )
  // Space pan and wheel zoom must not paint, and remain available in edit mode.
  await page.mouse.move(x, y)
  await page.keyboard.down("Space")
  await page.mouse.down()
  await page.mouse.move(x + 60, y + 30)
  await page.mouse.up()
  await page.keyboard.up("Space")
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -150)
  await page.keyboard.up("Control")
  await page.waitForTimeout(350)
  assert.equal(mask(await save("pan")), mask(erased), "Panning painted")
  const transformed = await overlay.boundingBox()
  await stroke(
    transformed.x + transformed.width * 0.52,
    transformed.y + transformed.height * 0.53,
    transformed.x + transformed.width * 0.52,
    transformed.y + transformed.height * 0.53
  )
  const zoomed = await save("zoomed")
  assert.notEqual(mask(zoomed), mask(erased))
  const decoded = decodeCellPaintMask(
    zoomed.layers.find((l) => l.id === "cells").params.paintMask
  )
  const beforeZoom = decodeCellPaintMask(
    erased.layers.find((l) => l.id === "cells").params.paintMask
  )
  const sampleX = Math.floor(
    (((0.52 - 0.5) * box.width) /
      Math.min(box.width, box.height) /
      decoded.width +
      0.5) *
      512
  )
  const sampleY = Math.floor(
    (((0.53 - 0.5) * box.height) /
      Math.min(box.width, box.height) /
      decoded.height +
      0.5) *
      512
  )
  assert.equal(
    beforeZoom.data[sampleY * 512 + sampleX],
    255,
    "Alignment fixture must start selected"
  )
  assert.equal(
    decoded.data[sampleY * 512 + sampleX],
    0,
    "Zoom/pan shifted the brush"
  )
  await page.getByRole("button", { name: "Done Painting", exact: true }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: ".context/paint-editor-ui.png" })
  // Import the actual saved file and verify coverage survives hydration.
  await page
    .getByRole("button", { name: "Export", exact: true })
    .filter({ visible: true })
    .click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page
    .locator('input[accept=".lab,application/json"]')
    .last()
    .setInputFiles(".context/paint-zoomed.lab")
  await ready()
  assert.equal(mask(await save("reopened")), mask(zoomed))
  assert.deepEqual(errors, [])
  console.log(
    "PASS paint strokes, atomic undo/redo, erase, cancellation, clear, pan/zoom, actual save/reopen"
  )
} finally {
  await browser.close()
}
