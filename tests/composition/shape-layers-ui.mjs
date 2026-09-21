// Start the dev server, then bun tests/composition/shape-layers-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/shape-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: "shape",
    assets: [],
    layers: [
      { ...createLayer("shape"), id: "shape", name: "Shape" },
      { ...base, id: "field", name: "Field", params: { ...base.params, animate: false } },
    ],
    sceneConfig: {
      ...DEFAULT_SCENE_CONFIG,
      compositionAspect: "custom",
      compositionWidth: 720,
      compositionHeight: 960,
    },
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
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true })
  async function importFile(path) {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    await page
      .locator('input[accept=".lab,application/json"]')
      .last()
      .setInputFiles(path)
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await panel.locator('[data-layer-row="shape"]').waitFor()
    await ready()
  }
  async function save(name) {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    const downloaded = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Export .lab file", exact: true })
      .click()
    const download = await downloaded
    const path = `.context/shape-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const paramsOf = (project, id = "shape") =>
    project.layers.find((l) => l.id === id).params

  await importFile(".context/shape-ui-fixture.lab")
  await panel
    .locator('[data-layer-row="shape"]')
    .getByText("Shape", { exact: true })
    .click()
  const handles = page.locator('[data-shape-handles="true"]')
  await handles.waitFor()
  assert.equal(await page.locator('[data-mask-handles="true"]').count(), 0)
  const initial = paramsOf(await save("initial"))
  assert.deepEqual(initial.center, [0, 0])

  const center = page.locator('[data-shape-handle="center"]')
  const cb = await center.boundingBox()
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + 40, cb.y + 30, { steps: 6 })
  await page.mouse.move(cb.x + 90, cb.y + 60, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = paramsOf(await save("moved"))
  assert.ok(moved.center[0] > 0.05 && moved.center[1] > 0.03, `Center drag ${moved.center}`)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.deepEqual(paramsOf(await save("moved-undo")).center, [0, 0], "One drag is one undo step")
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(400)

  const xHandle = page.locator('[data-shape-handle="x"]')
  const xb = await xHandle.boundingBox()
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2)
  await page.mouse.down()
  await page.mouse.move(xb.x + 20, xb.y + 70, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const rotated = paramsOf(await save("rotated"))
  assert.ok(Math.abs(rotated.rotation) > 5, "X handle rotates the shape")
  assert.notEqual(rotated.size[0], moved.size[0], "X handle resizes width")
  assert.equal(rotated.size[1], moved.size[1], "X handle keeps height")

  const shapeSelect = page
    .getByRole("combobox")
    .filter({ hasText: /^Ellipse$/ })
    .filter({ visible: true })
    .first()
  await shapeSelect.click()
  await page.getByRole("option", { name: "Blades", exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole("slider", { name: /^Twist/ }).filter({ visible: true }).waitFor()
  assert.equal(await page.getByRole("slider", { name: /^Corner Radius/ }).count(), 0)
  assert.equal(paramsOf(await save("blades")).shape, "blades")
  await page.screenshot({ path: ".context/shape-layers-ui.png" })

  const add = panel.getByRole("button", { name: "Add layer", exact: true })
  await add.click()
  const menu = await add.getAttribute("aria-controls")
  await page
    .locator(`[id="${menu}"]`)
    .getByRole("button", { name: /^Shape$/ })
    .click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-layer-sidebar-panel="true"] [data-layer-row]'
      ).length >= 3
  )
  await ready()
  const added = await save("added")
  assert.equal(added.layers.filter((l) => l.type === "shape").length, 2, "Picker adds a Shape")

  await importFile(".context/shape-blades.lab")
  const reopened = paramsOf(await save("reopened"))
  assert.equal(reopened.shape, "blades")
  assert.deepEqual(reopened.center, rotated.center)
  assert.deepEqual(errors, [])
  console.log(
    "PASS shape handles drag/rotate, undo granularity, shape select and conditional params, picker entry, save/reopen"
  )
} finally {
  await browser.close()
}
