// Start the dev server, then bun tests/composition/blob-tracking-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/blob-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 960, height: 540 },
    selectedLayerId: "blob",
    assets: [],
    layers: [
      {
        ...createLayer("blob-tracking"),
        id: "blob",
        name: "Blob Tracking",
        params: { ...createLayer("blob-tracking").params, detectionMode: "luminance", persistentTracking: true },
      },
      { ...base, id: "field", name: "Field", params: { ...base.params, animate: true } },
    ],
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, compositionAspect: "16:9", compositionWidth: 960, compositionHeight: 540 },
    timeline: { duration: 5, loop: true, tracks: [] },
  })
)
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(process.env.SHADER_LAB_URL ?? "http://localhost:55000", { waitUntil: "domcontentloaded", timeout: 120000 })
  const panel = page.locator('[data-layer-sidebar-panel="true"]:visible')
  await panel.waitFor({ timeout: 120000 })
  async function ready() {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[class*="loader-bounce"]')].every((loader) => {
          for (let node = loader; node; node = node.parentElement) {
            const style = getComputedStyle(node)
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return true
          }
          return false
        }),
      null,
      { timeout: 120000 }
    )
  }
  await ready()
  const button = (name) => page.getByRole("button", { name, exact: true }).filter({ visible: true })
  async function save(name) {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    const downloaded = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export .lab file", exact: true }).click()
    const download = await downloaded
    const path = `.context/blob-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return (await Bun.file(path).json()).layers.find((l) => l.id === "blob").params
  }
  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page.locator('input[accept=".lab,application/json"]').last().setInputFiles(".context/blob-ui-fixture.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await panel.locator('[data-layer-row="blob"]').waitFor()
  await ready()
  await panel.locator('[data-layer-row="blob"]').getByText("Blob Tracking", { exact: true }).click()
  const combo = (text) => page.getByRole("combobox").filter({ hasText: new RegExp(`^${text}$`) }).filter({ visible: true }).first()
  const option = (name) => page.getByRole("option", { name, exact: true })
  const decorations = page.getByRole("button", { name: /Decorations/ }).filter({ visible: true }).first()
  if ((await decorations.count()) && (await decorations.getAttribute("aria-expanded")) === "false") await decorations.click()
  assert.equal(await page.getByRole("switch", { name: /^Outline/ }).filter({ visible: true }).count(), 0, "Legacy Outline toggle is hidden")
  await combo("Outline").click()
  await option("Corner brackets").click()
  await page.waitForTimeout(400)
  await page.getByRole("slider", { name: /^Bracket Length/ }).filter({ visible: true }).waitFor()
  assert.equal((await save("brackets")).frameStyle, "brackets")

  await combo("Coordinates").click()
  await option("Prefix + ID").click()
  await page.waitForTimeout(300)
  const prefix = page.getByRole("textbox", { name: /^Label Prefix/ }).filter({ visible: true })
  await prefix.waitFor()
  await prefix.fill("TARGET")
  await page.waitForTimeout(400)
  const id = await save("id")
  assert.equal(id.labelMode, "id")
  assert.equal(id.labelPrefix, "TARGET")
  await page.getByRole("slider", { name: /^Label Seed/ }).filter({ visible: true }).waitFor()

  await combo("Prefix \\+ ID").click()
  await option("Custom list").click()
  await page.waitForTimeout(300)
  const list = page.getByRole("textbox", { name: /^Label List/ }).filter({ visible: true })
  await list.waitFor()
  assert.equal(await list.evaluate((el) => el.tagName), "TEXTAREA")
  await list.fill("ALPHA\nBETA\nGAMMA")
  await page.waitForTimeout(400)
  assert.equal((await save("custom")).labelList, "ALPHA\nBETA\nGAMMA")

  const dots = page.getByRole("slider", { name: /^Edge Dots/ }).filter({ visible: true })
  assert.equal(await page.getByRole("slider", { name: /^Dot Size/ }).filter({ visible: true }).count(), 0, "Dot Size hidden while dots are off")
  await dots.focus()
  await page.keyboard.press("End")
  await page.waitForTimeout(400)
  await page.getByRole("slider", { name: /^Dot Size/ }).filter({ visible: true }).waitFor()
  const dotted = await save("dots")
  assert.equal(dotted.edgeDots, 1)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: ".context/blob-tracking-ui.png" })

  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page.locator('input[accept=".lab,application/json"]').last().setInputFiles(".context/blob-dots.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await ready()
  const reopened = await save("reopened")
  assert.equal(reopened.frameStyle, "brackets")
  assert.equal(reopened.labelList, "ALPHA\nBETA\nGAMMA")
  assert.equal(reopened.edgeDots, 1)
  assert.deepEqual(errors, [])
  console.log("PASS blob tracking frame select, label modes with prefix and custom list, edge dots with conditional size, save/reopen")
} finally {
  await browser.close()
}
