// Start the dev server, then bun tests/composition/threshold-colors-ui.mjs.
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import { mkdir } from "node:fs/promises"
await mkdir(".context", { recursive: true })
const group = {
  ...createLayer("group"),
  id: "group",
  name: "Photographic study",
}
const threshold = {
  ...createLayer("threshold"),
  id: "threshold",
  parentId: group.id,
}
const photo = { ...createLayer("image"), id: "photo-layer", parentId: group.id }
await Bun.write(
  ".context/threshold-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: threshold.id,
    assets: [],
    layers: [group, threshold, photo],
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
  await panel
    .getByRole("button", { name: "Reorder Video", exact: true })
    .waitFor({ timeout: 120000 })
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
    .setInputFiles(".context/threshold-ui-fixture.lab")
  await panel.locator('[data-layer-row="threshold"]').waitFor()
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
    .locator('[data-layer-row="threshold"]')
    .getByText("Threshold", { exact: true })
    .click()
  await ready()

  await page.getByText("Dark Color", { exact: true }).first().waitFor()
  async function color(from, to, _label) {
    await page.getByRole("button", { name: from, exact: true }).click()
    await page.locator("[data-color-picker-popup] input").fill(to)
    await page.keyboard.press("Escape")
    await page.locator("[data-color-picker-popup]").waitFor({ state: "hidden" })
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
    const file = `.context/threshold-${name}.lab`
    await download.saveAs(file)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return (await Bun.file(file).json()).layers.find(
      (l) => l.id === "threshold"
    ).params
  }
  await color("#000000", "#162FC4", "Dark Color")
  await color("#FFFFFF", "#F04E9B", "Light Color")
  const chosen = await save("chosen")
  assert.equal(chosen.darkColor, "#162FC4")
  assert.equal(chosen.lightColor, "#F04E9B")
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(350)
  assert.equal((await save("undo")).lightColor.toLowerCase(), "#ffffff")
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(350)
  assert.deepEqual(await save("redo"), chosen)
  await page.screenshot({ path: ".context/threshold-editor-ui.png" })
  await page
    .getByRole("button", { name: "Export", exact: true })
    .filter({ visible: true })
    .click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page
    .locator('input[accept=".lab,application/json"]')
    .last()
    .setInputFiles(".context/threshold-chosen.lab")
  await ready()
  assert.deepEqual(await save("reopened"), chosen)
  assert.deepEqual(errors, [])
  console.log(
    "PASS Threshold color controls, undo/redo, actual .lab save and hydration"
  )
} finally {
  await browser.close()
}
