import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createLayer } from "@/lib/editor/layers"
import {
  GRADIENT_MAP_PRESETS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

const out = ".context/gradient-map-keyframes"
await mkdir(out, { recursive: true })
await Bun.write(
  `${out}/ui-fixture.lab`,
  JSON.stringify({
    format: "shader-lab",
    version: 7,
    composition: { width: 1512, height: 908 },
    selectedLayerId: "map",
    assets: [],
    layers: [
      { ...createLayer("gradient-map"), id: "map", name: "Gradient Map" },
      { ...createLayer("image"), id: "photo", name: "Photo" },
    ],
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 4, loop: true, tracks: [] },
  })
)
const preset = (id) =>
  serializeGradientMapStops(GRADIENT_MAP_PRESETS.find((p) => p.id === id).stops)
const canonical = (stops) => serializeGradientMapStops(parseGradientMapStops(stops))
const browser = await chromium.launch({
  headless: true,
  args: (process.env.WEBGPU_FLAGS ?? "--enable-unsafe-webgpu,--enable-gpu").split(","),
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
    await panel.locator('[data-layer-row="map"]').waitFor()
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
    const path = `${out}/ui-${name}.lab`
    await download.saveAs(path)
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    return await Bun.file(path).json()
  }
  const rampTrack = (project) =>
    project.timeline.tracks.find(
      (t) => t.layerId === "map" && t.binding.key === "stops"
    )

  await importFile(`${out}/ui-fixture.lab`)
  await panel
    .locator('[data-layer-row="photo"]')
    .getByText("Photo", { exact: true })
    .click()
  const chooser = page.waitForEvent("filechooser")
  await page
    .getByRole("button", { name: "Replace", exact: true })
    .filter({ visible: true })
    .click()
  await (await chooser).setFiles("public/examples/effects/slice.webp")
  await ready()
  await page.waitForTimeout(1000)
  await panel
    .locator('[data-layer-row="map"]')
    .getByText("Gradient Map", { exact: true })
    .click()
  const visible = (locator) => locator.filter({ visible: true })
  await visible(page.getByRole("button", { name: "Expand timeline panel" })).click()
  const pause = visible(page.getByRole("button", { name: "Pause playback" }))
  if (await pause.count()) await pause.click()
  await visible(page.getByRole("button", { name: "Stop playback" })).click()
  const section = visible(page.locator('[data-gradient-map-section="true"]'))
  const presetBox = section.getByRole("combobox", { name: "Gradient map preset" })
  const keyframe = visible(
    section.getByRole("button", { name: "Create keyframe for Ramp" })
  )
  await keyframe.waitFor()
  await keyframe.click()
  await page.waitForTimeout(300)
  let project = await save("first-key")
  let track = rampTrack(project)
  assert.ok(track, "Keyframe button must create a Ramp track")
  assert.equal(track.binding.valueType, "gradient")
  assert.equal(track.keyframes.length, 1)
  assert.equal(canonical(track.keyframes[0].value), preset("thermal"))
  assert.equal(track.keyframes[0].time, 0)

  const scrub = visible(
    page.locator('[data-timeline-shell] div[class*="basis-[30px]"] > div.absolute.inset-0')
  ).first()
  const ruler = await scrub.boundingBox()
  const scrubTo = async (fraction) => {
    await page.mouse.click(ruler.x + ruler.width * fraction, ruler.y + ruler.height - 4)
    await page.waitForTimeout(250)
  }
  await scrubTo(0.98)
  await presetBox.click()
  await page.getByRole("option", { name: "Duotone", exact: true }).click()
  await page.waitForTimeout(300)
  project = await save("auto-key")
  track = rampTrack(project)
  assert.equal(track.keyframes.length, 2, "Auto-Key must add a keyframe at the playhead")
  assert.equal(canonical(track.keyframes[1].value), preset("duotone"))
  assert.ok(track.keyframes[1].time > 3.7, `Second key at ${track.keyframes[1].time}`)
  assert.equal(
    canonical(project.layers.find((l) => l.id === "map").params.stops),
    preset("thermal"),
    "With a track, ramp edits key the track instead of the base value"
  )
  const lanes = visible(page.locator('[aria-label^="Keyframe at"]'))
  assert.equal(await lanes.count(), 2, "The timeline must show both ramp keyframes")

  await scrubTo(0.52)
  await presetBox.filter({ hasText: /^Custom$/ }).waitFor()
  await page.screenshot({ path: `${out}/ui-mid.png` })

  await visible(page.getByRole("button", { name: "Auto-key" })).click()
  await presetBox.click()
  await page.getByRole("option", { name: "Sepia", exact: true }).click()
  await page.waitForTimeout(300)
  await presetBox.filter({ hasText: /^Sepia$/ }).waitFor()
  project = await save("preview-only")
  assert.equal(
    rampTrack(project).keyframes.length,
    2,
    "Without Auto-Key an edit only previews"
  )
  await keyframe.click()
  await page.waitForTimeout(300)
  project = await save("manual-key")
  track = rampTrack(project)
  assert.equal(track.keyframes.length, 3, "The keyframe button commits the previewed ramp")
  assert.equal(canonical(track.keyframes[1].value), preset("sepia"))
  await page.screenshot({ path: `${out}/ui-three-keys.png` })

  await page.keyboard.press("Meta+z")
  await page.waitForTimeout(400)
  assert.equal(rampTrack(await save("undo")).keyframes.length, 2, "Undo removes the keyframe")
  await importFile(`${out}/ui-manual-key.lab`)
  const reopened = await save("reopened")
  assert.deepEqual(
    rampTrack(reopened).keyframes.map((k) => canonical(k.value)),
    [preset("thermal"), preset("sepia"), preset("duotone")],
    "Save/reopen keeps the ramp keyframes"
  )
  assert.deepEqual(errors, [], JSON.stringify(errors))
  console.log(
    "PASS gradient map ramp keyframe button, Auto-Key at the playhead, preview without Auto-Key, timeline lane, undo, actual save/reopen"
  )
} finally {
  await browser.close()
}
