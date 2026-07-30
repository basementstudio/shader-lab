/**
 * Playwright harness for driving the editor UI end to end.
 *
 * Uses the Chrome Canary channel: the editor only renders under WebGPU, and
 * Canary is the most reliable way to get it headed on macOS.
 *
 * It writes screenshots as well as assertions, deliberately. Playwright's
 * `fill()` will happily type into a field a human can neither see nor focus, so
 * assertions alone can report success on a broken UI — that is how the unstyled
 * audio range inputs slipped through until a screenshot was inspected.
 *
 * Run: EDITOR_URL=http://localhost:3000/tools/shader-lab bun run scripts/ui-debug.ts <audio-file>
 */

import { chromium, type ConsoleMessage, type Page } from "playwright"

const BASE_URL = process.env.EDITOR_URL ?? "http://localhost:3000/tools/shader-lab"
const AUDIO_PATH = process.argv[2]
const SHOT_DIR = process.env.SHOT_DIR ?? ".ui-debug-shots"

const consoleErrors: string[] = []
const pageErrors: string[] = []

function recordConsole(message: ConsoleMessage): void {
  if (message.type() === "error") {
    consoleErrors.push(message.text())
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
  console.log(`  · shot: ${SHOT_DIR}/${name}.png`)
}

/** Read the audio store straight out of the page for ground truth. */
async function readAudioState(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const hook = (
      globalThis as {
        __SHADER_LAB_AUDIO_DEBUG__?: () => unknown
      }
    ).__SHADER_LAB_AUDIO_DEBUG__

    return hook ? hook() : "debug hook not installed"
  })
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
    channel: "chrome-canary",
    headless: false,
  })

  const page = await browser.newPage({ viewport: { height: 900, width: 1600 } })
  page.on("console", recordConsole)
  page.on("pageerror", (error) => {
    pageErrors.push(error.message)
  })

  console.log(`\n→ loading ${BASE_URL}`)
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(6000)
  await shot(page, "01-loaded")

  console.log(`\nvisible text (first 400 chars):`)
  console.log(
    (await page.locator("body").innerText()).slice(0, 400).replace(/\n+/g, " | ")
  )

  // --- open the Audio popover -------------------------------------------------
  console.log(`\n→ opening the Audio chip`)
  const chip = page.getByRole("button", { name: /audio/i }).first()
  console.log(`  chip count: ${await page.getByText("Audio", { exact: true }).count()}`)

  if ((await chip.count()) === 0) {
    console.log("  !! no Audio chip found — dumping buttons")
    const labels = await page.locator("button").allInnerTexts()
    console.log(`  buttons: ${JSON.stringify(labels.slice(0, 40))}`)
  } else {
    await chip.click()
    await page.waitForTimeout(600)
    await shot(page, "02-audio-popover")
  }

  // --- load the track ---------------------------------------------------------
  console.log(`\n→ loading audio: ${AUDIO_PATH ?? "(none given, skipping)"}`)
  const fileInput = page.locator('input[type="file"][accept*="audio"]')
  console.log(`  audio file inputs found: ${await fileInput.count()}`)

  if (AUDIO_PATH && (await fileInput.count()) > 0) {
    await fileInput.first().setInputFiles(AUDIO_PATH)
    await page.waitForTimeout(6000)
    await shot(page, "03-analyzed")
    console.log(`  audio state: ${JSON.stringify(await readAudioState(page))}`)
  }

  // --- find a param row's audio-link button ----------------------------------
  console.log(`\n→ looking for param-row audio link buttons`)
  const linkButtons = page.getByRole("button", { name: /link .* to audio/i })
  const editButtons = page.getByRole("button", { name: /edit audio link/i })
  console.log(`  "link to audio" buttons: ${await linkButtons.count()}`)
  console.log(`  "edit audio link" buttons: ${await editButtons.count()}`)

  if ((await linkButtons.count()) > 0) {
    const first = linkButtons.first()
    console.log(`  clicking: ${await first.getAttribute("aria-label")}`)
    await first.click()
    await page.waitForTimeout(600)
    await shot(page, "04-link-popover")

    // pick Bass
    const bass = page.getByRole("button", { name: "Bass", exact: true })
    console.log(`  Bass buttons: ${await bass.count()}`)
    if ((await bass.count()) > 0) {
      await bass.first().click()
      await page.waitForTimeout(600)
      await shot(page, "05-bass-linked")
      console.log(`  audio state: ${JSON.stringify(await readAudioState(page))}`)
    }

    // --- the reported bug: try to change the output range -------------------
    console.log(`\n→ attempting to edit the output range`)
    const atPeak = page.getByLabel("At peak")
    const atSilence = page.getByLabel("At silence")
    console.log(`  "At peak" fields: ${await atPeak.count()}`)
    console.log(`  "At silence" fields: ${await atSilence.count()}`)

    if ((await atPeak.count()) > 0) {
      const field = atPeak.first()
      console.log(`  visible: ${await field.isVisible()}`)
      console.log(`  enabled: ${await field.isEnabled()}`)
      console.log(`  editable: ${await field.isEditable()}`)
      console.log(`  value before: ${await field.inputValue()}`)

      try {
        await field.click({ timeout: 4000 })
        await field.fill("0.42", { timeout: 4000 })
        await field.press("Enter")
        await page.waitForTimeout(400)
        console.log(`  value after fill+Enter: ${await field.inputValue()}`)
        console.log(`  audio state: ${JSON.stringify(await readAudioState(page))}`)
      } catch (error) {
        console.log(
          `  !! interaction FAILED: ${error instanceof Error ? error.message.split("\n")[0] : error}`
        )
      }

      await shot(page, "06-after-range-edit")
    }
  }

  console.log(`\n=== console errors (${consoleErrors.length}) ===`)
  for (const error of consoleErrors.slice(0, 25)) {
    console.log(`  ${error}`)
  }

  console.log(`\n=== uncaught page errors (${pageErrors.length}) ===`)
  for (const error of pageErrors.slice(0, 25)) {
    console.log(`  ${error}`)
  }

  await browser.close()
}

await main()
