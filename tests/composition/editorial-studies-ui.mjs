// Dev server required: bun tests/composition/editorial-studies-ui.mjs
import assert from "node:assert/strict"
import { chromium } from "playwright"
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
  async function load(file) {
    await page
      .getByRole("button", { name: "Export", exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    await page
      .locator('input[accept=".lab,application/json"]')
      .last()
      .setInputFiles(file)
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await panel.locator('[data-layer-row="cells"]').waitFor()
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
    const file = `.context/editorial-${name}.lab`
    await download.saveAs(file)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(file).json()
  }
  const params = (project) =>
    project.layers.find((l) => l.id === "cells").params
  const scatter = page.getByRole("slider", { name: /^Edge Scatter/ })
  await load("public/examples/v3/color-field.lab")
  assert.equal(await scatter.getAttribute("aria-valuenow"), "0.65")
  await scatter.focus()
  await scatter.press("ArrowRight")
  assert.equal(params(await save("changed")).edgeScatter, 0.66)
  await page.keyboard.press("Meta+z")
  assert.equal(params(await save("undo")).edgeScatter, 0.65)
  await page.keyboard.press("Meta+Shift+z")
  assert.equal(params(await save("redo")).edgeScatter, 0.66)
  await page
    .getByRole("combobox")
    .filter({ hasText: /^Regions$/ })
    .click()
  await page
    .getByRole("option", { name: "Individual Cells", exact: true })
    .click()
  assert.equal(await scatter.count(), 0)
  await page
    .getByRole("combobox")
    .filter({ hasText: /^Individual Cells$/ })
    .click()
  await page.getByRole("option", { name: "Regions", exact: true }).click()
  assert.equal(await scatter.getAttribute("aria-valuenow"), "0.66")
  await load("public/examples/v3/color-field.lab")
  await page.screenshot({ path: ".context/color-field-ui.png" })
  const color = await save("color")
  assert.equal(color.layers.find((l) => l.id === "dots").parentId, "study")
  assert.equal(
    color.layers.find((l) => l.id === "title").parentId ?? null,
    null
  )
  await load(".context/editorial-color.lab")
  assert.deepEqual(params(await save("color-reopened")), params(color))
  await load("public/examples/v3/painted-flora.lab")
  assert.equal(await scatter.getAttribute("aria-valuenow"), "0.25")
  const photo = await save("photo")
  assert.ok(params(photo).paintMask.startsWith("pc1:"))
  assert.ok(
    photo.assets.some(
      (a) =>
        a.id === "flora" && a.url === "/scenes/default/editorial/flora.webp"
    )
  )
  assert.equal(photo.layers.find((l) => l.id === "photo").assetId, "flora")
  // Hydration must not enter editor paint mode or leave its faint guide in view.
  await page.getByRole("button", { name: "Edit Paint", exact: true }).waitFor()
  await page.screenshot({ path: ".context/painted-flora-ui.png" })
  await load(".context/editorial-photo.lab")
  assert.deepEqual(params(await save("photo-reopened")), params(photo))
  assert.deepEqual(errors, [])
  console.log(
    "PASS editable studies, Edge Scatter controls/history/layout visibility, bundled media and .lab hydration"
  )
} finally {
  await browser.close()
}
