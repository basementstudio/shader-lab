// Dev server required: bun tests/composition/clean-projects-ui.mjs
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
const artifacts = ".context/clean-projects"
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-webgpu-adapter=swiftshader",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})
const url = process.env.SHADER_LAB_URL ?? "http://localhost:55000"
const demo = await Bun.file("src/lib/editor/default-project.json").json()
let page
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  page = await context.newPage()
  page.setDefaultTimeout(120000)
  const errors = []
  const demoRequests = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    if (demo.assets.some((a) => new URL(a.url, url).href === request.url()))
      demoRequests.push(request.url())
  })
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true })
  async function ready() {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[class*="loader-bounce"]')].every(
        (loader) => {
          for (let node = loader; node; node = node.parentElement) {
            const s = getComputedStyle(node)
            if (
              s.display === "none" ||
              s.visibility === "hidden" ||
              Number(s.opacity) === 0
            )
              return true
          }
          return false
        }
      )
    )
  }
  async function projectAction(name) {
    await button("Project").click()
    await button(name).click()
  }
  let sequence = 0
  async function save() {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    const downloaded = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Export .lab file", exact: true })
      .click()
    const path = `${artifacts}/project-${sequence++}.lab`
    await (await downloaded).saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return Bun.file(path).json()
  }
  async function load(file) {
    await button("Export").click()
    await page.getByRole("button", { name: "project", exact: true }).click()
    await page
      .locator('input[accept=".lab,application/json"]')
      .last()
      .setInputFiles(file)
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await ready()
  }
  async function latestRecord() {
    return page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("shader-lab", 2)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const records = await new Promise((resolve, reject) => {
        const req = db.transaction("autosave").objectStore("autosave").getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      db.close()
      return records.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null
    })
  }
  async function waitSaved(predicate) {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const record = await latestRecord()
      if (record && predicate(record.projectFile)) return record
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error("Autosave did not persist expected project")
  }
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.getByText("Add a layer to start", { exact: true }).waitFor()
  await ready()
  assert.deepEqual(demoRequests, [], "First visit fetched demo media")
  await button("Scene settings").click()
  await page
    .getByText("Global colors neutral", { exact: true })
    .filter({ visible: true })
    .waitFor()
  const blank = await save()
  assert.equal(blank.layers.length, 0)
  assert.equal(blank.sceneConfig.exposure, 0)
  assert.equal(await button("Global colors active").count(), 0)
  await page.screenshot({ path: `${artifacts}/blank-desktop.png` })

  await projectAction("Open demo")
  await button("Global colors active").waitFor()
  const opened = await save()
  const rounded = (v) =>
    JSON.parse(
      JSON.stringify(v, (_k, n) =>
        typeof n === "number" ? Math.round(n * 1e12) / 1e12 : n
      )
    )
  assert.deepEqual(rounded(opened.sceneConfig), rounded(demo.sceneConfig))
  assert.equal(opened.layers.length, demo.layers.length)
  await button("Global colors active").click()
  await button("Reset all global colors").waitFor()
  await page.screenshot({ path: `${artifacts}/global-colors.png` })
  await button("Reset all global colors").click()
  await page
    .getByText("Global colors neutral", { exact: true })
    .filter({ visible: true })
    .waitFor()
  const reset = await save()
  assert.deepEqual(reset.sceneConfig, {
    ...blank.sceneConfig,
    backgroundColor: demo.sceneConfig.backgroundColor,
    compositionAspect: demo.sceneConfig.compositionAspect,
    compositionWidth: demo.sceneConfig.compositionWidth,
    compositionHeight: demo.sceneConfig.compositionHeight,
  })
  await page.keyboard.press("Meta+z")
  assert.deepEqual(
    (await save()).sceneConfig,
    opened.sceneConfig,
    "Reset undo lost global grading"
  )
  await page.keyboard.press("Meta+Shift+z")
  assert.deepEqual(
    (await save()).sceneConfig,
    reset.sceneConfig,
    "Reset redo lost neutral grading"
  )

  // Start blank while an edit's 220 ms history debounce is still pending.
  await page
    .getByRole("slider", { name: /^Exposure/ })
    .filter({ visible: true })
    .focus()
  await page
    .getByRole("slider", { name: /^Exposure/ })
    .filter({ visible: true })
    .press("ArrowRight")
  await projectAction("New blank project")
  await page.getByText("Add a layer to start", { exact: true }).waitFor()
  await waitSaved((p) => p.layers.length === 0 && p.sceneConfig.exposure === 0)
  assert.ok(
    await button("Undo").isDisabled(),
    "New document retained pending history"
  )
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.getByText("Restored your last session", { exact: true }).waitFor()
  await page.getByText("Add a layer to start", { exact: true }).waitFor()
  assert.equal((await save()).layers.length, 0, "Reload resurrected demo")
  await page.screenshot({ path: `${artifacts}/restored-desktop.png` })
  if (await button("Dismiss restore notice").count())
    await button("Dismiss restore notice").click()

  const authored = await Bun.file("public/examples/v3/painted-flora.lab").json()
  authored.sceneConfig.exposure = 0.75
  const authoredPath = `${artifacts}/authored.lab`
  await Bun.write(authoredPath, JSON.stringify(authored))
  await load(authoredPath)
  await waitSaved(
    (p) =>
      p.sceneConfig.exposure === 0.75 &&
      p.layers.length === authored.layers.length
  )
  await page.reload({ waitUntil: "domcontentloaded" })
  await button("Global colors active").waitFor()
  const restored = await save()
  assert.equal(restored.sceneConfig.exposure, 0.75)
  assert.equal(
    restored.layers.find((l) => l.id === "cells").params.paintMask,
    authored.layers.find((l) => l.id === "cells").params.paintMask
  )
  // Same action in the restored-session pill must create a blank document.
  if (await button("New blank project").count()) {
    await button("New blank project").click()
  } else await projectAction("New blank project")
  await waitSaved((p) => p.layers.length === 0)
  await load(`${artifacts}/project-0.lab`)
  assert.equal(
    (await save()).layers.length,
    0,
    "Empty .lab import did not hydrate"
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await button("Actions").click()
  await button("Project").click()
  await page.screenshot({ path: `${artifacts}/project-mobile.png` })
  await button("Open demo").click()
  await button("Scene — global colors active").click()
  await button("Reset all global colors").waitFor()
  await page.screenshot({ path: `${artifacts}/global-colors-mobile.png` })
  await button("Reset all global colors").click()
  await page
    .getByText("Global colors neutral", { exact: true })
    .filter({ visible: true })
    .waitFor()
  await button("Actions").click()
  await projectAction("New blank project")
  await waitSaved((p) => p.layers.length === 0)
  await page.setViewportSize({ width: 1280, height: 800 })
  // Hold the first boot read after it has captured an older authored project.
  await page.evaluate(async (projectFile) => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open("shader-lab", 2)
      req.onsuccess = () => resolve(req.result)
    })
    await new Promise((resolve) => {
      const tx = db.transaction("autosave", "readwrite")
      tx.objectStore("autosave").put({
        projectFile,
        sessionId: "delayed-old-project",
        savedAt: Date.now(),
        schemaVersion: 1,
        remixOrigin: null,
        activeDraft: null,
      })
      tx.oncomplete = resolve
    })
    db.close()
  }, authored)
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.getAll
    const setter = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      "onsuccess"
    ).set
    let holding = true
    const releases = []
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = original.apply(this, args)
      if (this.name === "autosave" && holding) {
        Object.defineProperty(request, "onsuccess", {
          set(callback) {
            setter.call(request, (event) => {
              if (!holding) {
                callback.call(request, event)
                return
              }
              releases.push(() => callback.call(request, event))
              window.__releaseBootRead = () => {
                holding = false
                for (const release of releases.splice(0)) release()
              }
            })
          },
        })
      }
      return request
    }
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForFunction(
    () => typeof window.__releaseBootRead === "function"
  )
  await projectAction("New blank project")
  await page.evaluate(() => window.__releaseBootRead())
  await waitSaved((p) => p.layers.length === 0)
  // Let boot's awaited IDB and React work finish, then inspect the real editor export.
  const raced = await save()
  assert.equal(
    raced.layers.length,
    0,
    "Late recovery overwrote user's new blank project"
  )
  assert.equal(raced.sceneConfig.exposure, 0)
  assert.ok(await button("Undo").isDisabled())
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForFunction(
    () => typeof window.__releaseBootRead === "function"
  )
  const duringBoot = structuredClone(authored)
  duringBoot.sceneConfig.exposure = 1.25
  await Bun.write(`${artifacts}/during-boot.lab`, JSON.stringify(duringBoot))
  await load(`${artifacts}/during-boot.lab`)
  await page.evaluate(() => window.__releaseBootRead())
  assert.equal(
    (await save()).sceneConfig.exposure,
    1.25,
    "Late recovery overwrote an explicit file import"
  )
  await waitSaved((p) => p.sceneConfig.exposure === 1.25)
  assert.deepEqual(errors, [])
  console.log(
    "PASS neutral first visit/no demo fetch, demo grading, reset/undo/redo, pending history, blank autosave/reload, authored restore, empty import, mobile actions/colors"
  )
} catch (error) {
  await page?.screenshot({ path: `${artifacts}/failure.png` })
  console.error((await page?.locator("body").innerText())?.slice(0, 3000))
  throw error
} finally {
  await browser.close()
}
