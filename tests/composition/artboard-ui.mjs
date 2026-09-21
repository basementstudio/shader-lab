// Start the dev server, then bun tests/composition/artboard-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_LAYER_MASK, DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/artboard-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: "threshold",
    assets: [],
    layers: [
      {
        ...createLayer("threshold"),
        id: "threshold",
        name: "Threshold",
        mask: { ...DEFAULT_LAYER_MASK, shape: "ellipse", center: [0.2, 0.1], size: [0.3, 0.2] },
      },
      { ...base, id: "field", name: "Field", params: { ...base.params, animate: false } },
    ],
    sceneConfig: {
      ...DEFAULT_SCENE_CONFIG,
      backgroundColor: "#f5f2ee",
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
    await panel.locator('[data-layer-row="threshold"]').waitFor()
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
    const path = `.context/artboard-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const artboard = page.locator('[data-artboard="fixed"]')
  const canvas = page.locator('[data-editor-canvas="true"]')
  const handle = page.locator('[data-mask-handle="center"]')
  async function measure() {
    await page.waitForTimeout(500)
    const box = await artboard.boundingBox()
    const h = await handle.boundingBox()
    const canvasSize = await canvas.evaluate((el) => [el.width, el.height])
    return {
      ratio: box.width / box.height,
      fx: (h.x + h.width / 2 - box.x) / box.width,
      fy: (h.y + h.height / 2 - box.y) / box.height,
      box,
      canvasSize,
    }
  }

  await importFile(".context/artboard-ui-fixture.lab")
  await panel
    .locator('[data-layer-row="threshold"]')
    .getByText("Threshold", { exact: true })
    .click()
  await artboard.waitFor()
  await handle.waitFor()
  const wide = await measure()
  assert.ok(Math.abs(wide.ratio - 0.75) < 0.01, `Artboard ratio ${wide.ratio}`)
  assert.ok(wide.box.height < 960 && wide.box.width < 1440, "Artboard is fitted, not full-bleed")
  assert.ok(
    Math.abs(wide.canvasSize[0] / wide.canvasSize[1] - 0.75) < 0.02,
    `Render canvas ratio ${wide.canvasSize}`
  )
  assert.ok(wide.fx > 0.6 && wide.fy > 0.5, `Handle sits off-center (${wide.fx}, ${wide.fy})`)

  await page.setViewportSize({ width: 1000, height: 700 })
  const narrow = await measure()
  assert.ok(Math.abs(narrow.ratio - 0.75) < 0.01, `Ratio after resize ${narrow.ratio}`)
  assert.ok(narrow.box.height < wide.box.height, "Artboard rescaled to the smaller window")
  assert.ok(Math.abs(narrow.fx - wide.fx) < 0.01 && Math.abs(narrow.fy - wide.fy) < 0.01, "Mask stays put relative to the artboard")
  assert.deepEqual((await save("resized")).composition, { width: 720, height: 960 })
  await page.screenshot({ path: ".context/artboard-ui-narrow.png" })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: ".context/artboard-ui.png" })

  await button("Scene settings").click()
  const aspect = page
    .getByRole("combobox")
    .filter({ hasText: /^Custom$/ })
    .filter({ visible: true })
    .first()
  await aspect.click()
  await page.getByRole("option", { name: "16:9", exact: true }).click()
  await page.waitForTimeout(500)
  const landscape = await artboard.boundingBox()
  assert.ok(Math.abs(landscape.width / landscape.height - 16 / 9) < 0.02, "16:9 artboard")
  const cropped = await save("landscape")
  assert.deepEqual(cropped.composition, { width: 720, height: 405 })
  assert.equal(cropped.sceneConfig.compositionAspect, "16:9")

  await page
    .getByRole("combobox")
    .filter({ hasText: /^16:9$/ })
    .filter({ visible: true })
    .first()
    .click()
  await page.getByRole("option", { name: "Screen (adaptive)", exact: true }).click()
  await page.locator('[data-artboard="screen"]').waitFor()
  await page.waitForTimeout(500)
  const screenBox = await page.locator('[data-artboard="screen"]').boundingBox()
  assert.ok(screenBox.width >= 1400 && screenBox.height >= 900, "Adaptive mode fills the viewport")
  assert.equal((await save("screen")).sceneConfig.compositionAspect, "screen")

  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(500)
  await page.keyboard.press("Meta+z")
  await artboard.waitFor()
  const restored = await measure()
  assert.ok(Math.abs(restored.ratio - 0.75) < 0.01, `Undo restores the custom artboard (${restored.ratio})`)
  assert.deepEqual((await save("undo")).composition, { width: 720, height: 960 })

  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page
    .locator('input[accept=".lab,application/json"]')
    .last()
    .setInputFiles("public/examples/v3/color-field.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await ready()
  await artboard.waitFor()
  const study = await artboard.boundingBox()
  assert.ok(Math.abs(study.width / study.height - 0.75) < 0.01, "Editorial study opens as a fixed artboard")
  assert.deepEqual(errors, [])
  console.log(
    "PASS fixed artboard fit, window resize keeps framing, aspect crop, adaptive fallback, undo, study import"
  )
} finally {
  await browser.close()
}
