import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const photo = createLayer("image")
await Bun.write(
  ".context/depth-estimate-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 1512, height: 909 },
    selectedLayerId: "photo",
    assets: [
      {
        id: "flora",
        kind: "image",
        url: "/scenes/default/editorial/flora.webp",
        fileName: "flora.webp",
        mimeType: "image/webp",
        width: 1512,
        height: 909,
      },
    ],
    layers: [{ ...photo, id: "photo", name: "Photo", assetId: "flora" }],
    sceneConfig: DEFAULT_SCENE_CONFIG,
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
    await panel.locator('[data-layer-row="photo"]').waitFor()
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
    const path = `.context/depth-estimate-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const layerOf = (project) => project.layers.find((l) => l.id === "photo")

  await importFile(".context/depth-estimate-ui-fixture.lab")
  await panel
    .locator('[data-layer-row="photo"]')
    .getByText("Photo", { exact: true })
    .click()
  const estimate = page
    .getByRole("button", { name: "Estimate", exact: true })
    .filter({ visible: true })
  await estimate.waitFor()
  const started = performance.now()
  await estimate.click()
  await page
    .getByText(/Loading depth model|Downloading depth model|Estimating depth/)
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 60000 })
  await page
    .getByRole("slider", { name: /^Depth Range/ })
    .filter({ visible: true })
    .waitFor({ timeout: 900000 })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  try {
    await page.getByText(/flora-depth\.png/).filter({ visible: true }).first().waitFor({ timeout: 15000 })
  } catch (error) {
    await page.screenshot({ path: ".context/depth-estimate-ui-failure.png" })
    const rows = await page.getByText("Depth map", { exact: true }).locator("..").allTextContents()
    throw new Error(`Depth map row did not show the file name: ${JSON.stringify(rows)} (${error.message.split("\n")[0]})`)
  }
  await ready()
  const attached = await save("attached")
  const depthId = layerOf(attached).depthAssetId
  assert.ok(depthId, "Estimate attaches a depth asset")
  assert.ok(
    attached.assets.some((a) => a.id === depthId && a.fileName === "flora-depth.png"),
    "The estimated depth map is listed with the project assets"
  )
  assert.equal(layerOf(attached).params.depthInvert, false)
  const toggled = await page.evaluate(() => {
    const switches = [...document.querySelectorAll("[role='switch']")].filter(
      (control) => control.checkVisibility()
    )
    const report = []
    for (const control of switches) {
      let node = control.parentElement
      for (let depth = 0; depth < 5 && node; depth++, node = node.parentElement) {
        const text = node.textContent ?? ""
        if (text.length < 240 && /Show Depth/.test(text)) {
          control.click()
          return { clicked: true, tag: control.tagName, text: text.slice(0, 80) }
        }
      }
      report.push((control.parentElement?.parentElement?.textContent ?? "").slice(0, 40))
    }
    return { clicked: false, report }
  })
  assert.ok(toggled.clicked, `Show Depth toggle must be clickable: ${JSON.stringify(toggled)}`)
  await page.waitForTimeout(1500)
  assert.equal(layerOf(await save("depth-view")).params.depthView, true)
  await page.screenshot({ path: ".context/depth-estimate-ui.png" })
  const canvas = page.locator("canvas").first()
  await canvas.screenshot({ path: ".context/depth-estimate-canvas.png" })
  assert.deepEqual(errors, [])
  console.log(`PASS depth estimate in the app: model download, inference, attach, Show Depth (${seconds}s)`)
} finally {
  await browser.close()
}
