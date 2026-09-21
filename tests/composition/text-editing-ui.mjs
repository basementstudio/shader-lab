// Start the dev server, then bun tests/composition/text-editing-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/text-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 720, height: 960 },
    selectedLayerId: "headline",
    assets: [],
    layers: [
      {
        ...createLayer("text"),
        id: "headline",
        name: "Headline",
        params: { ...createLayer("text").params, text: "Hello", fontSize: 64 },
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
    const path = `.context/text-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const headline = (project) => project.layers.find((l) => l.id === "headline").params
  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page.locator('input[accept=".lab,application/json"]').last().setInputFiles(".context/text-ui-fixture.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await panel.locator('[data-layer-row="headline"]').waitFor()
  await ready()
  await panel.locator('[data-layer-row="headline"]').getByText("Headline", { exact: true }).click()

  const handles = page.locator('[data-text-handles="true"]')
  await handles.waitFor()
  const center = page.locator('[data-text-handle="center"]')
  const cb = await center.boundingBox()
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + 60, cb.y + 40, { steps: 6 })
  await page.mouse.move(cb.x + 120, cb.y + 80, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = headline(await save("moved"))
  assert.ok(moved.offset[0] > 0.05 && moved.offset[1] < -0.02, `Center drag moves offset (${moved.offset})`)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.deepEqual(headline(await save("moved-undo")).offset, [0, 0], "One drag is one undo step")
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(400)

  const x = page.locator('[data-text-handle="x"]')
  const xb = await x.boundingBox()
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2)
  await page.mouse.down()
  await page.mouse.move(xb.x - 20, xb.y + 70, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const rotated = headline(await save("rotated"))
  assert.ok(Math.abs(rotated.rotation) > 5, `X handle rotates text (${rotated.rotation})`)

  const y = page.locator('[data-text-handle="y"]')
  const yb = await y.boundingBox()
  await page.mouse.move(yb.x + yb.width / 2, yb.y + yb.height / 2)
  await page.mouse.down()
  await page.mouse.move(yb.x + 20, yb.y + 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const resized = headline(await save("resized"))
  assert.ok(resized.fontSize !== 64, `Y handle changes font size (${resized.fontSize})`)

  const artboard = page.locator('[data-artboard="fixed"]')
  const ab = await artboard.boundingBox()
  await page.mouse.dblclick(ab.x + ab.width * 0.15, ab.y + ab.height * 0.85)
  const editor = page.getByRole("textbox", { name: "Edit text" })
  await editor.waitFor()
  await handles.waitFor({ state: "hidden" })
  await page.keyboard.press("Meta+a")
  await page.keyboard.type("Small")
  await page.keyboard.press("Enter")
  await page.keyboard.type("labels")
  await page.waitForTimeout(200)
  await page.keyboard.press("Meta+Enter")
  await editor.waitFor({ state: "hidden" })
  await handles.waitFor()
  await page.waitForTimeout(400)
  const typed = headline(await save("typed"))
  assert.equal(typed.text, "Small\nlabels", "In-place typing commits multiline text")
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(headline(await save("typed-undo")).text, "Hello", "Whole edit is one undo step")
  await page.keyboard.press("Meta+Shift+z")
  await page.waitForTimeout(400)

  await button("Edit text").click()
  await editor.waitFor()
  await page.keyboard.press("Meta+a")
  await page.keyboard.type("discard me")
  await page.keyboard.press("Escape")
  await editor.waitFor({ state: "hidden" })
  await page.waitForTimeout(400)
  assert.equal(headline(await save("escaped")).text, "Small\nlabels", "Escape restores the original text")

  const size = page.getByRole("slider", { name: /^Font Size/ }).filter({ visible: true })
  await size.waitFor()
  await size.focus()
  await page.keyboard.press("Home")
  await page.waitForTimeout(400)
  const tiny = headline(await save("tiny"))
  assert.equal(tiny.fontSize, 8, `Font Size slider goes down to 8 (${tiny.fontSize})`)
  const area = page.getByRole("textbox", { name: /^Text/ }).filter({ visible: true }).first()
  assert.equal(await area.evaluate((el) => el.tagName), "TEXTAREA", "Sidebar text field is multiline")
  await page.screenshot({ path: ".context/text-editing-ui.png" })
  assert.deepEqual(errors, [])
  console.log("PASS text handles move/rotate/resize with undo, double-click in-place editing, Cmd+Enter commit, Escape cancel, sidebar textarea, font size below 48")
} finally {
  await browser.close()
}
