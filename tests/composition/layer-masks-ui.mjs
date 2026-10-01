// Start the dev server, then bun tests/composition/layer-masks-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
function solid(id, color, name) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    name,
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
const group = { ...createLayer("group"), id: "portrait", name: "Portrait" }
const threshold = {
  ...createLayer("threshold"),
  id: "threshold",
  name: "Threshold",
  parentId: group.id,
  params: { threshold: 0.1, softness: 0.01, noise: 0 },
}
await Bun.write(
  ".context/mask-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: threshold.id,
    assets: [],
    layers: [
      group,
      threshold,
      { ...solid("red", "#ff0000", "Red"), parentId: group.id },
      solid("blue", "#0000ff", "Blue"),
    ],
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
  async function importFile(path) {
    await page
      .getByRole("button", { name: "Export", exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    await page
      .locator('input[accept=".lab,application/json"]')
      .last()
      .setInputFiles(path)
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await panel.locator('[data-layer-row="threshold"]').waitFor()
    await ready()
  }
  await importFile(".context/mask-ui-fixture.lab")
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
    const path = `.context/mask-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const maskOf = (project, id) => project.layers.find((l) => l.id === id).mask
  const section = () =>
    page.locator('[data-layer-mask-section="true"]').filter({ visible: true })
  async function chooseShape(label) {
    await section().getByRole("combobox", { name: "Mask shape" }).click()
    await page.getByRole("option", { name: label, exact: true }).click()
    await page.waitForTimeout(350)
  }
  async function selectRow(id, text, shape) {
    await panel
      .locator(`[data-layer-row="${id}"]`)
      .getByText(text, { exact: true })
      .click()
    await section()
      .getByRole("combobox", { name: "Mask shape" })
      .filter({ hasText: new RegExp(`^${shape}$`) })
      .waitFor()
  }

  await selectRow("threshold", "Threshold", "None")
  assert.equal(await section().count(), 1, "One visible mask section")
  assert.equal(maskOf(await save("initial"), "threshold"), undefined)
  await chooseShape("Ellipse")
  const handles = page.locator('[data-mask-handles="true"]')
  await handles.waitFor()
  await section().getByRole("combobox", { name: "Mask scope" }).waitFor()
  const ellipse = maskOf(await save("ellipse"), "threshold")
  assert.equal(ellipse.shape, "ellipse")
  assert.deepEqual(ellipse.center, [0, 0])

  const center = page.locator('[data-mask-handle="center"]')
  const box = await center.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 40, cy + 20, { steps: 6 })
  await page.mouse.move(cx + 80, cy + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = maskOf(await save("moved"), "threshold")
  assert.ok(moved.center[0] > 0.05 && moved.center[1] > 0.02, "Center drag")
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.deepEqual(
    maskOf(await save("moved-undo"), "threshold").center,
    [0, 0],
    "One drag is one undo step"
  )
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(400)
  assert.deepEqual(maskOf(await save("moved-redo"), "threshold").center, moved.center)

  const xHandle = page.locator('[data-mask-handle="x"]')
  const xb = await xHandle.boundingBox()
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2)
  await page.mouse.down()
  await page.mouse.move(xb.x + 30, xb.y + 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const rotated = maskOf(await save("rotated"), "threshold")
  assert.ok(Math.abs(rotated.rotation) > 5, "X handle rotates")
  assert.notEqual(rotated.size[0], moved.size[0], "X handle resizes width")
  assert.equal(rotated.size[1], moved.size[1], "X handle keeps height")

  const yHandle = page.locator('[data-mask-handle="y"]')
  const yb = await yHandle.boundingBox()
  await page.mouse.move(yb.x + yb.width / 2, yb.y + yb.height / 2)
  await page.mouse.down()
  await page.mouse.move(yb.x + 40, yb.y + 90, { steps: 6 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await page.waitForTimeout(400)
  assert.deepEqual(maskOf(await save("cancelled"), "threshold"), rotated)

  await section().getByRole("combobox", { name: "Mask scope" }).click()
  await page.getByRole("option", { name: "Cut content", exact: true }).click()
  await page.waitForTimeout(300)
  assert.equal(maskOf(await save("scope"), "threshold").scope, "content")

  await selectRow("portrait", "Portrait", "None")
  assert.equal(
    await section().getByRole("combobox", { name: "Mask scope" }).count(),
    0,
    "Groups do not expose a scope"
  )
  await chooseShape("Rectangle")
  await section().getByRole("slider", { name: /^Feather/ }).waitFor()
  assert.equal(maskOf(await save("group"), "portrait").shape, "rectangle")

  await selectRow("threshold", "Threshold", "Ellipse")
  await chooseShape("Brush")
  const overlay = page.locator('[data-paint-target="mask"]')
  await overlay.waitFor()
  await handles.waitFor({ state: "hidden" })
  await page.getByRole("button", { name: "Done", exact: true }).waitFor()
  const ob = await overlay.boundingBox()
  const px = ob.x + ob.width * 0.4
  const py = ob.y + ob.height * 0.4
  await page.mouse.move(px, py)
  await page.mouse.down()
  await page.mouse.move(px + 120, py + 60, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const painted = maskOf(await save("painted"), "threshold")
  assert.ok(painted.paint.startsWith("pc1:"), "Brush stroke persisted")
  assert.equal(painted.shape, "brush")
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(maskOf(await save("paint-undo"), "threshold").paint, "")
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(400)
  assert.equal(maskOf(await save("paint-redo"), "threshold").paint, painted.paint)
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await overlay.waitFor({ state: "hidden" })
  await page.getByRole("button", { name: "Edit Mask", exact: true }).click()
  await overlay.waitFor()
  await page.getByRole("button", { name: "Clear Mask", exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(maskOf(await save("cleared"), "threshold").paint, "")
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(maskOf(await save("clear-undo"), "threshold").paint, painted.paint)
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await overlay.waitFor({ state: "hidden" })
  await page.waitForTimeout(400)
  await page.screenshot({ path: ".context/layer-masks-ui.png" })

  await importFile(".context/mask-clear-undo.lab")
  const reopened = await save("reopened")
  assert.equal(maskOf(reopened, "threshold").paint, painted.paint)
  assert.equal(maskOf(reopened, "portrait").shape, "rectangle")
  assert.equal(maskOf(reopened, "blue"), undefined)
  assert.deepEqual(errors, [])
  console.log(
    "PASS mask section, ellipse handles drag/rotate/cancel, undo granularity, scope, group mask, brush strokes, clear, actual save/reopen"
  )
} finally {
  await browser.close()
}
