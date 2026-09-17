// Run against the local editor: SHADER_LAB_URL=http://localhost:55000 bun tests/composition/group-drag-ui.mjs
import assert from "node:assert/strict"
import { mkdir, readFile } from "node:fs/promises"
import { chromium } from "playwright"

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/solid-text-background.json", import.meta.url),
    "utf8"
  )
)
const template = fixture.layers[0]
function layer(id, parentId = null, group = false, expanded = true) {
  return {
    ...template,
    id,
    name: id,
    parentId,
    kind: group ? "group" : "source",
    type: group ? "group" : "text",
    expanded,
    opacity: 1,
    params: group ? {} : { ...template.params, text: id, backgroundAlpha: 0 },
  }
}
Object.assign(fixture, {
  version: 7,
  assets: [],
  selectedLayerId: "Child",
  layers: [
    layer("Group A", null, true),
    layer("Child", "Group A"),
    layer("Group B", null, true, false),
    layer("Outside"),
  ],
  timeline: { duration: 1, loop: true, tracks: [] },
})
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-webgpu-adapter=swiftshader",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})
await mkdir(".context/group-drag-test", { recursive: true })
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
  async function waitForCanvas() {
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
  await waitForCanvas()
  async function projectDialog() {
    await page
      .getByRole("button", { name: "Export", exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole("button", { name: "project", exact: true }).click()
  }
  async function loadProject(project) {
    await projectDialog()
    await page
      .locator('input[accept=".lab,application/json"]')
      .last()
      .setInputFiles({
        name: "group-drag.lab",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(project)),
      })
    await panel.locator('[data-layer-row="Child"]').waitFor()
    await waitForCanvas()
    await page.waitForTimeout(400)
  }
  const row = (id) => panel.locator(`[data-layer-row="${id}"]`)
  const item = (id) => panel.locator(`[data-layer-item="${id}"]`)
  const parent = (id) =>
    item(id).evaluate(
      (node) =>
        node.parentElement.closest("[data-layer-item]")?.dataset.layerItem ??
        null
    )
  async function drag(id, targetId, placement, check, left = false) {
    const handle = panel.getByRole("button", {
      name: `Reorder ${id}`,
      exact: true,
    })
    await handle.scrollIntoViewIfNeeded()
    await handle.hover()
    const from = await handle.boundingBox()
    const to = await row(targetId).boundingBox()
    const x = left ? to.x - 8 : to.x + to.width / 2
    let y = to.y + to.height / 2
    if (placement === "before") y = to.y + 2
    if (placement === "after") y = to.y + to.height - 2
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 10 })
    if (check) await check()
    await page.mouse.up()
  }
  await loadProject(fixture)
  console.log("Loaded group drag fixture")
  await drag("Child", "Group B", "inside", async () => {
    assert.equal(
      await parent("Child"),
      "Group A",
      "Membership changed before drop"
    )
    assert.equal(await row("Group B").getAttribute("data-drop-inside"), "true")
    await page.screenshot({
      path: ".context/group-drag-test/inside-preview.png",
    })
  })
  assert.equal(await parent("Child"), "Group B")
  await panel
    .getByRole("button", { name: "Collapse Group B", exact: true })
    .waitFor()
  await page.keyboard.press("Meta+z")
  assert.equal(await parent("Child"), "Group A", "UI undo failed")
  await page.keyboard.press("Meta+Shift+z")
  assert.equal(await parent("Child"), "Group B", "UI redo failed")
  await drag("Child", "Outside", "before")
  assert.equal(
    await parent("Child"),
    null,
    "Child remained in group after root drop"
  )
  await drag("Outside", "Group A", "inside")
  assert.equal(await parent("Outside"), "Group A")
  await drag("Child", "Outside", "after")
  assert.equal(
    await parent("Child"),
    "Group A",
    "Drop beside child did not enter group"
  )
  await drag("Group A", "Group B", "inside")
  assert.equal(await parent("Group A"), "Group B")
  assert.equal(await parent("Child"), "Group A", "Moving group lost child")
  await drag("Group B", "Group A", "inside", async () => {
    assert.equal(
      await row("Group A").getAttribute("data-drop-inside"),
      null,
      "Cycle was advertised as valid"
    )
  })
  assert.equal(await parent("Group B"), null, "Cycle committed")
  await drag(
    "Child",
    "Outside",
    "after",
    async () => {
      await page.keyboard.press("Escape")
    },
    true
  )
  assert.equal(await parent("Child"), "Group A", "Escape committed a drop")
  await drag("Child", "Outside", "after", null, true)
  assert.equal(
    await parent("Child"),
    "Group B",
    "Left gutter failed to outdent one level"
  )
  await page.screenshot({ path: ".context/group-drag-test/nested-result.png" })

  await projectDialog()
  const downloaded = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Export .lab file", exact: true })
    .click()
  const saved = JSON.parse(
    await readFile(await (await downloaded).path(), "utf8")
  )
  assert.equal(
    saved.layers.find((entry) => entry.id === "Child").parentId,
    "Group B",
    "Saved membership disagrees with UI"
  )
  await page
    .getByRole("button", { name: "Close export dialog", exact: true })
    .filter({ visible: true })
    .last()
    .click()
  await loadProject(saved)
  assert.equal(
    await parent("Child"),
    "Group B",
    "Reopened membership disagrees with saved file"
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Layers", exact: true }).click()
  await drag("Child", "Outside", "after", async () => {
    await page.screenshot({
      path: ".context/group-drag-test/mobile-preview.png",
    })
  })
  assert.equal(
    await parent("Child"),
    "Group A",
    "Mobile drop into group failed"
  )
  await page.screenshot({ path: ".context/group-drag-test/mobile-result.png" })
  // Real touch pointer capture, including the release that commits the move.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true })
  const touchFrom = await panel
    .getByRole("button", { name: "Reorder Child", exact: true })
    .boundingBox()
  const touchTo = await row("Group B").boundingBox()
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchFrom.x + 8, y: touchFrom.y + 8, id: 1 }],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: touchTo.x + 100, y: touchTo.y + touchTo.height - 2, id: 1 },
    ],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  assert.equal(await parent("Child"), null, "Touch drop failed to leave group")
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false })

  await page.setViewportSize({ width: 1440, height: 960 })
  const longProject = {
    ...fixture,
    layers: [
      fixture.layers[0],
      fixture.layers[1],
      ...Array.from({ length: 18 }, (_, i) => layer(`Extra ${i}`)),
      fixture.layers[2],
    ],
  }
  await loadProject(longProject)
  const scrollRoot = panel.locator("[data-layer-tree-root]")
  const scrollHandle = panel.getByRole("button", {
    name: "Reorder Child",
    exact: true,
  })
  await scrollHandle.hover()
  const start = await scrollHandle.boundingBox()
  const list = await scrollRoot.boundingBox()
  await page.mouse.move(start.x + 8, start.y + 8)
  await page.mouse.down()
  await page.mouse.move(list.x + list.width / 2, list.y + list.height - 3, {
    steps: 10,
  })
  await page.waitForFunction(() => {
    const roots = [...document.querySelectorAll("[data-layer-tree-root]")]
    const root = roots.find((node) => node.getBoundingClientRect().width > 0)
    return root && root.scrollTop > 450
  })
  await page.mouse.move(800, 400)
  await page.mouse.up()
  assert.equal(
    await parent("Child"),
    "Group A",
    "Release outside scrolling list committed a drop"
  )
  console.log("PASS touch drop and long-list edge scroll/outside cancellation")
  assert.deepEqual(errors, [], "Browser errors")
  console.log(
    "PASS desktop/mobile group drops, hierarchy preview, cycles, outdent, Escape, undo/redo, real .lab save/reopen"
  )
} finally {
  await browser.close()
}
