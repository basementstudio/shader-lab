// Start the dev server, then bun tests/composition/gradient-map-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import {
  GRADIENT_MAP_PRESETS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/gradient-map-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: "map",
    assets: [],
    layers: [
      { ...createLayer("gradient-map"), id: "map", name: "Gradient Map" },
      {
        ...base,
        id: "field",
        name: "Field",
        params: { ...base.params, animate: false },
      },
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
    await panel.locator('[data-layer-row="map"]').waitFor()
    await ready()
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
    const path = `.context/gradient-map-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const stopsOf = (project, id = "map") =>
    serializeGradientMapStops(
      parseGradientMapStops(project.layers.find((l) => l.id === id).params.stops)
    )
  const presetStops = (id) =>
    serializeGradientMapStops(GRADIENT_MAP_PRESETS.find((p) => p.id === id).stops)

  await importFile(".context/gradient-map-ui-fixture.lab")
  await panel
    .locator('[data-layer-row="map"]')
    .getByText("Gradient Map", { exact: true })
    .click()
  const section = page
    .locator('[data-gradient-map-section="true"]')
    .filter({ visible: true })
  const preset = section.getByRole("combobox", { name: "Gradient map preset" })
  await preset.filter({ hasText: /^Thermal$/ }).waitFor()
  assert.equal(await section.count(), 1)
  await page.getByRole("slider", { name: /^Amount/ }).filter({ visible: true }).waitFor()
  assert.equal(
    await page.getByRole("textbox", { name: /^Ramp/ }).count(),
    0,
    "Raw stops text field must stay hidden"
  )
  assert.equal(stopsOf(await save("initial")), presetStops("thermal"))

  await preset.click()
  await page.getByRole("option", { name: "Sepia", exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(stopsOf(await save("sepia")), presetStops("sepia"))
  await preset.filter({ hasText: /^Sepia$/ }).waitFor()

  const bar = section.locator(".cursor-crosshair")
  const box = await bar.boundingBox()
  const middle = bar.locator("button").nth(1)
  const mb = await middle.boundingBox()
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, mb.y + mb.height / 2, { steps: 6 })
  await page.mouse.move(box.x + box.width * 0.9, mb.y + mb.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const dragged = parseGradientMapStops(
    (await save("dragged")).layers[0].params.stops
  )
  const moved = dragged.find((s) => s.color === "#8c6a3f")
  const light = dragged.find((s) => s.color === "#f1e4c6")
  assert.ok(moved.position > 0.85, `Dragged stop must pass the light stop (${moved.position})`)
  assert.equal(light.position, 1, "The stop being passed must not move")
  assert.equal(dragged.find((s) => s.color === "#2b1d0e").position, 0)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(stopsOf(await save("drag-undo")), presetStops("sepia"))
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.waitForTimeout(400)
  await preset.filter({ hasText: /^Custom$/ }).waitFor()
  const custom = await save("custom")
  assert.equal(parseGradientMapStops(custom.layers[0].params.stops).length, 4)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(stopsOf(await save("undo")), presetStops("sepia"), "Undo removes the added stop")

  const add = panel.getByRole("button", { name: "Add layer", exact: true })
  await add.click()
  const menu = await add.getAttribute("aria-controls")
  await page
    .locator(`[id="${menu}"]`)
    .getByRole("button", { name: /Gradient Map/ })
    .first()
    .click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-layer-sidebar-panel="true"] [data-layer-row]'
      ).length >= 3
  )
  await ready()
  const added = await save("added")
  assert.equal(
    added.layers.filter((l) => l.type === "gradient-map").length,
    2,
    "Picker adds a Gradient Map"
  )
  await page.screenshot({ path: ".context/gradient-map-ui.png" })
  await importFile(".context/gradient-map-undo.lab")
  assert.equal(stopsOf(await save("reopened")), presetStops("sepia"))
  assert.deepEqual(errors, [])
  console.log(
    "PASS gradient map section, presets, ramp stop add/undo, picker entry, actual save/reopen"
  )
} finally {
  await browser.close()
}
