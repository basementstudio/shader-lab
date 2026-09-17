import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { chromium } from "playwright"

const root = resolve(import.meta.dir, "../..")
const directory = resolve(import.meta.dir)
const update = process.argv.includes("--update")
const artifacts = resolve(root, ".context/composition-test")
await mkdir(artifacts, { recursive: true })
const bundle = await Bun.build({
  entrypoints: [resolve(directory, "browser.mjs")],
  target: "browser",
  define: { "process.env": "{}" },
})
if (!bundle.success)
  throw new AggregateError(bundle.logs, "Composition harness failed to bundle")

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/")
      return new Response(
        `<!doctype html><style>
      @font-face { font-family: "Fixture Mono"; src: url("/fonts/geist/Geist-Mono.woff2"); font-weight: 100 900; }
      :root { --geist-mono: "Fixture Mono"; }
      </style><script type="module" src="/browser.js"></script>`,
        { headers: { "Content-Type": "text/html" } }
      )
    if (path === "/browser.js")
      return new Response(bundle.outputs[0], {
        headers: { "Content-Type": "text/javascript" },
      })
    if (path === "/scenes/default/alpha-sample.svg")
      return new Response(
        Bun.file(resolve(directory, "fixtures/alpha-sample.svg"))
      )
    const base =
      path.startsWith("/fixtures/") || path.startsWith("/baselines/")
        ? directory
        : resolve(root, "public")
    const file = resolve(base, `.${path}`)
    if (!(file.startsWith(`${base}${sep}`) && (await Bun.file(file).exists())))
      return new Response("Not found", { status: 404 })
    return new Response(Bun.file(file))
  },
})

let browser
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(120_000)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto(server.url.href)
  await page.waitForFunction(() => typeof window.checkProject === "function")
  await page.evaluate(() => document.fonts.load('400 96px "Fixture Mono"'))
  assert.ok(
    await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter())),
    "WebGPU is required; no fallback or skipped tests"
  )

  console.log(
    "Existing project:",
    await page.evaluate(() => window.checkExistingProject())
  )
  const blends = await page.evaluate(() => window.checkLegacyBlendContract())
  const blendPath = resolve(directory, "baselines/legacy-blends.json")
  for (const sample of blends) {
    assert.ok(
      sample.rgba.every(Number.isFinite),
      `Non-finite pixel: ${JSON.stringify(sample)}`
    )
    assert.equal(sample.rgba[3], 1, "Legacy compositor is opaque")
  }
  const half = blends.length / 2
  for (let i = 0; i < half; i++) {
    assert.deepEqual(
      blends[i].rgba,
      blends[i + half].rgba,
      "Editor/runtime blend mismatch"
    )
  }
  if (update) {
    await Bun.write(blendPath, `${JSON.stringify(blends, null, 2)}\n`)
  } else {
    const expected = await Bun.file(blendPath).json()
    assert.equal(blends.length, expected.length)
    for (const [index, sample] of blends.entries()) {
      const { rgba, ...identity } = sample
      const { rgba: expectedRgba, ...expectedIdentity } = expected[index]
      assert.deepEqual(identity, expectedIdentity)
      for (let channel = 0; channel < 4; channel++) {
        assert.ok(
          Math.abs(rgba[channel] - expectedRgba[channel]) < 0.00001,
          `Legacy blend changed: ${JSON.stringify(sample)}`
        )
      }
    }
  }
  console.log(`PASS ${blends.length} editor/runtime blend and mask samples`)
  for (const name of [
    "legacy-text-mask",
    "solid-text-background",
    "transparent-text-screen",
    "contained-image-halftone",
  ]) {
    const result = await page.evaluate(
      ({ name, update }) => window.checkProject(name, update),
      { name, update }
    )
    const output = update
      ? resolve(directory, `baselines/${name}.png`)
      : resolve(artifacts, `${name}.png`)
    await Bun.write(output, Buffer.from(result.png.split(",")[1], "base64"))
    assert.equal(
      result.baselineDiff?.changedPixels ?? 0,
      0,
      `${name}: ${JSON.stringify(result.baselineDiff)}; actual image: ${output}`
    )
    console.log(
      `PASS ${name}: preview/export and reopen match; ${result.colors} colors`
    )
  }
  assert.deepEqual(errors, [], "Browser or GPU errors occurred")
  console.log(
    update
      ? "Baseline capture complete. Review images before committing."
      : "Composition baselines passed."
  )
} finally {
  await browser?.close()
  server.stop(true)
}
