import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const photo = createLayer("image")
await Bun.write(
  ".context/depth-parallax-ui-fixture.lab",
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
    const path = `.context/depth-parallax-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const layerOf = (project) => project.layers.find((l) => l.id === "photo")

  await importFile(".context/depth-parallax-ui-fixture.lab")
  await panel
    .locator('[data-layer-row="photo"]')
    .getByText("Photo", { exact: true })
    .click()
  const attach = page
    .getByRole("button", { name: "Attach", exact: true })
    .filter({ visible: true })
  await attach.waitFor()
  assert.equal(
    await page.getByRole("slider", { name: /^Depth Range/ }).filter({ visible: true }).count(),
    0,
    "Depth controls stay hidden until a depth map is attached"
  )
  const initial = await save("initial")
  assert.equal(layerOf(initial).depthAssetId ?? null, null)

  const depthPng = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1512
    canvas.height = 909
    const context = canvas.getContext("2d")
    const gradient = context.createLinearGradient(0, 0, 0, 909)
    gradient.addColorStop(0, "#000000")
    gradient.addColorStop(1, "#ffffff")
    context.fillStyle = gradient
    context.fillRect(0, 0, 1512, 909)
    return canvas.toDataURL("image/png")
  })
  const chooser = page.waitForEvent("filechooser")
  await attach.click()
  await (await chooser).setFiles({
    name: "flora-depth.png",
    mimeType: "image/png",
    buffer: Buffer.from(depthPng.split(",")[1], "base64"),
  })
  await page
    .getByRole("slider", { name: /^Depth Range/ })
    .filter({ visible: true })
    .waitFor()
  await page.getByText("flora-depth.png", { exact: true }).filter({ visible: true }).waitFor()
  await ready()
  const attached = await save("attached")
  const depthId = layerOf(attached).depthAssetId
  assert.ok(depthId, "Attaching stores the depth asset id on the layer")
  assert.ok(
    attached.assets.some((a) => a.id === depthId && a.fileName === "flora-depth.png"),
    "The depth map is listed with the project assets"
  )
  assert.equal(layerOf(attached).assetId, "flora", "The color asset is untouched")

  const motion = page
    .getByRole("combobox")
    .filter({ hasText: /^Orbit$/ })
    .filter({ visible: true })
    .first()
  await motion.click()
  await page.getByRole("option", { name: "Sway", exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(layerOf(await save("sway")).params.parallaxMotion, "sway")
  await page.screenshot({ path: ".context/depth-parallax-ui.png" })

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
      ).length >= 2
  )
  await ready()
  const inputSelect = page
    .getByRole("combobox")
    .filter({ hasText: /^Luminance$/ })
    .filter({ visible: true })
    .first()
  await inputSelect.click()
  await page.getByRole("option", { name: "Depth", exact: true }).click()
  await page.waitForTimeout(400)
  const maskShape = page
    .getByRole("combobox", { name: "Mask shape" })
    .filter({ visible: true })
    .first()
  await maskShape.click()
  await page.getByRole("option", { name: "Depth", exact: true }).click()
  await page.getByRole("slider", { name: /^Near/ }).filter({ visible: true }).first().waitFor()
  await page.getByRole("slider", { name: /^Far/ }).filter({ visible: true }).first().waitFor()
  await page.waitForTimeout(400)
  const withMap = await save("gradient-map")
  const mapLayer = withMap.layers.find((l) => l.type === "gradient-map")
  assert.equal(mapLayer.params.input, "depth", "Input select stores depth")
  assert.equal(mapLayer.mask.shape, "depth", "Mask shape select stores depth")
  assert.deepEqual(mapLayer.mask.size, [0.4, 1], "Depth mask starts with a near/far range")
  await page
    .getByRole("button", { name: "Expand timeline panel", exact: true })
    .filter({ visible: true })
    .first()
    .click()
  await page.waitForTimeout(600)
  await page
    .getByRole("button", { name: "Create keyframe for Mask Near / Far", exact: true })
    .filter({ visible: true })
    .first()
    .click()
  await page.waitForTimeout(400)
  const keyed = await save("mask-keyframe")
  const rangeTrack = keyed.timeline.tracks.find(
    (track) => track.layerId === mapLayer.id && track.binding.key === "mask.size"
  )
  assert.ok(rangeTrack, "The keyframe button on Near creates a Mask Near / Far track")
  assert.equal(rangeTrack.keyframes.length, 1)
  assert.deepEqual(rangeTrack.keyframes[0].value, [0.4, 1])
  await page.screenshot({ path: ".context/depth-parallax-ui-scene-depth.png" })
  await panel
    .locator('[data-layer-row="photo"]')
    .getByText("Photo", { exact: true })
    .click()
  await page
    .getByRole("button", { name: "Remove", exact: true })
    .filter({ visible: true })
    .click()
  await page.waitForTimeout(400)
  assert.equal(
    await page.getByRole("slider", { name: /^Depth Range/ }).filter({ visible: true }).count(),
    0,
    "Removing the depth map hides the Depth controls"
  )
  assert.equal(layerOf(await save("removed")).depthAssetId, null)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(layerOf(await save("undo")).depthAssetId, depthId, "Undo restores the depth map")
  await page
    .getByRole("slider", { name: /^Depth Range/ })
    .filter({ visible: true })
    .waitFor()
  assert.deepEqual(errors, [])
  console.log(
    "PASS depth map attach/replace/remove, gated Depth controls, motion select, Input → Depth, Depth mask shape, mask keyframe, undo, actual save"
  )
} finally {
  await browser.close()
}
