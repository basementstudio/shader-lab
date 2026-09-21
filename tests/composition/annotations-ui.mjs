// Start the dev server, then bun tests/composition/annotations-ui.mjs.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
await mkdir(".context", { recursive: true })
const base = createLayer("gradient")
await Bun.write(
  ".context/annotations-ui-fixture.lab",
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 960, height: 540 },
    selectedLayerId: "field",
    assets: [],
    layers: [{ ...base, id: "field", name: "Field", params: { ...base.params, animate: false } }],
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
    const path = `.context/annotations-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return (await Bun.file(path).json()).layers.find((l) => l.type === "annotations")?.params
  }
  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page.locator('input[accept=".lab,application/json"]').last().setInputFiles(".context/annotations-ui-fixture.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await panel.locator('[data-layer-row="field"]').waitFor()
  await ready()

  const add = panel.getByRole("button", { name: "Add layer", exact: true })
  await add.click()
  const menu = await add.getAttribute("aria-controls")
  await page.locator(`[id="${menu}"]`).getByRole("button", { name: /Annotations/ }).first().click()
  await page.waitForFunction(() => document.querySelectorAll('[data-layer-sidebar-panel="true"] [data-layer-row]').length >= 2)
  await ready()
  const initial = await save("added")
  assert.equal(initial.placement, "random")

  const handles = page.locator('[data-annotation-handles="true"]')
  await handles.waitFor()
  const center = page.locator('[data-annotation-handle="center"]')
  const cb = await center.boundingBox()
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + 80, cb.y + 50, { steps: 6 })
  await page.mouse.move(cb.x + 160, cb.y + 100, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = await save("moved")
  assert.ok(moved.targetCenter[0] > initial.targetCenter[0] + 0.1 && moved.targetCenter[1] > initial.targetCenter[1] + 0.05, `Target handle moves the center (${moved.targetCenter})`)
  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.deepEqual((await save("moved-undo")).targetCenter, initial.targetCenter, "One drag is one undo step")

  const section = page.locator('[data-annotations-section="true"]').filter({ visible: true })
  await section.getByRole("combobox", { name: "Apply text preset" }).click()
  await page.getByRole("option", { name: "Surveillance", exact: true }).click()
  await page.waitForTimeout(400)
  const preset = await save("preset")
  assert.equal(preset.textPreset, "surveillance")
  assert.ok(preset.labelList.startsWith("PERSON"), "Preset fills the word list")

  const combo = (text) => page.getByRole("combobox").filter({ hasText: new RegExp(`^${text}$`) }).filter({ visible: true }).first()
  await combo("Monochrome").click()
  await page.getByRole("option", { name: "Palette", exact: true }).click()
  await page.waitForTimeout(400)
  await section.locator(".cursor-crosshair").waitFor()

  await combo("Seeded").click()
  await page.getByRole("option", { name: "Painted", exact: true }).click()
  await page.waitForTimeout(400)
  await button("Edit Area").click()
  const overlay = page.locator('[data-paint-target="annotations"]')
  await overlay.waitFor()
  const ob = await overlay.boundingBox()
  await page.mouse.move(ob.x + ob.width * 0.3, ob.y + ob.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(ob.x + ob.width * 0.6, ob.y + ob.height * 0.5, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const painted = await save("painted")
  assert.equal(painted.placement, "painted")
  assert.ok(painted.paintMask.startsWith("pc1:"), "Brush strokes persist as placement")
  await button("Done").click()
  await overlay.waitFor({ state: "hidden" })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: ".context/annotations-ui.png" })

  await button("Export").click()
  await page.getByRole("button", { name: "project", exact: true }).click()
  await page.locator('input[accept=".lab,application/json"]').last().setInputFiles(".context/annotations-painted.lab")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await ready()
  const reopened = await save("reopened")
  assert.equal(reopened.paintMask, painted.paintMask)
  assert.equal(reopened.textPreset, "surveillance")
  assert.equal(reopened.colorMode, "palette")
  assert.deepEqual(errors, [])
  console.log("PASS annotations picker entry, target handle drag and undo, preset apply, palette ramp, painted placement with brush, save/reopen")
} finally {
  await browser.close()
}
