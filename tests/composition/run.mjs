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
    if (path === "/scenes/default/rings-photo.webp")
      return new Response(Bun.file(resolve(root, "public/examples/slice.webp")))
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
      "--use-webgpu-adapter=swiftshader",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(120_000)
  const errors = []
  page.on("pageerror", (error) => {
    errors.push(error.message)
    console.error(error.message)
  })
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
      console.error(message.text())
    }
  })
  page.on("requestfailed", (request) => {
    const message = `${request.url()}: ${request.failure()?.errorText}`
    errors.push(message)
    console.error(message)
  })
  await page.goto(server.url.href)
  await page.waitForFunction(() => typeof window.checkProject === "function")
  await page.evaluate(() => document.fonts.load('400 96px "Fixture Mono"'))
  assert.ok(
    await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter())),
    "WebGPU is required; no fallback or skipped tests"
  )
  console.log(
    "GPU adapter:",
    await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter()
      return adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null
    })
  )

  console.log(
    "Clean projects:",
    await page.evaluate(() => window.checkCleanProjects())
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
  const mediaBounds = await page.evaluate(() => window.checkMediaBounds())
  await Bun.write(
    resolve(artifacts, "transparent-media-bounds.png"),
    Buffer.from(mediaBounds.transparentPng.split(",")[1], "base64")
  )
  await Bun.write(
    resolve(artifacts, "solid-media-bounds.png"),
    Buffer.from(mediaBounds.solidPng.split(",")[1], "base64")
  )
  console.log(
    `PASS media bounds: ${mediaBounds.samples} editor/runtime image/video samples, migration, save/reopen, shader export, and PNG export`
  )
  const alphaSamples = await page.evaluate(() => window.checkAlphaCompositing())
  console.log(
    `PASS ${alphaSamples} alpha samples: source-over, effects, pass materials, grading, and the runtime texture pipeline`
  )
  const groups = await page.evaluate(() => window.checkGroups())
  await Bun.write(
    resolve(artifacts, "isolated-groups.png"),
    Buffer.from(groups.png.split(",")[1], "base64")
  )
  console.log(
    `PASS ${groups.samples} group checks: isolation, nesting, opacity, ordering, lifecycle, and editor PNG export`
  )
  assert.deepEqual(errors, [], "Browser or GPU errors occurred")
  const editorGroups = await page.evaluate(() => window.checkEditorGroups())
  await Bun.write(
    resolve(artifacts, "saved-editor-group.png"),
    Buffer.from(editorGroups.png.split(",")[1], "base64")
  )
  console.log(
    `PASS editor groups: store operations, history, v7 hydration, ${editorGroups.tracks} animation tracks, shader export, and saved/reopened pixels`
  )
  const text = await page.evaluate(() => window.checkTransparentText())
  await Bun.write(
    resolve(artifacts, "new-transparent-text.png"),
    Buffer.from(text.png.split(",")[1], "base64")
  )
  console.log(
    `PASS transparent text: ${text.samples} editor/runtime pixel checks, legacy hydration, save/reopen, and PNG export`
  )
  const rings = await page.evaluate(() => window.checkDisplacedRings())
  await Bun.write(
    resolve(artifacts, "displaced-rings-preview.webp"),
    Buffer.from(rings.previewWebp.split(",")[1], "base64")
  )
  for (const [name, png] of [
    ["ring-cutout", rings.png],
    ["displaced-rings-preview", rings.previewPng],
  ]) {
    await Bun.write(
      resolve(artifacts, `${name}.png`),
      Buffer.from(png.split(",")[1], "base64")
    )
  }
  console.log(
    `PASS displaced rings: ${rings.samples} GPU cases, 48 distinct bands (${rings.denseMs}ms including readback), hydration, runtime export, group cutouts, preview/PNG`
  )
  const threshold = await page.evaluate(() => window.checkThresholdColors())
  await Bun.write(
    resolve(artifacts, "threshold-colors.png"),
    Buffer.from(threshold.png.split(",")[1], "base64")
  )
  console.log(
    `PASS threshold colors: ${threshold.samples} editor/runtime GPU cases, decoded video, alpha, history, hydration and PNG export`
  )
  const cells = await page.evaluate(() => window.checkPhotographicCells())
  await Bun.write(
    resolve(artifacts, "photographic-cells-preview.webp"),
    Buffer.from(cells.previewWebp.split(",")[1], "base64")
  )
  for (const [name, png] of [
    ["cell-cutout", cells.png],
    ["photographic-cells-preview", cells.previewPng],
  ]) {
    await Bun.write(
      resolve(artifacts, `${name}.png`),
      Buffer.from(png.split(",")[1], "base64")
    )
  }
  console.log(
    `PASS photographic cells: ${cells.samples} editor/runtime GPU cases, full-detail interiors, alpha, hydration, runtime export, groups, preview/PNG`
  )
  const masks = await page.evaluate(() => window.checkLayerMasks())
  await Bun.write(
    resolve(artifacts, "layer-masks.png"),
    Buffer.from(masks.png.split(",")[1], "base64")
  )
  console.log(
    `PASS layer masks: ${masks.samples} editor/runtime GPU cases, group cutouts, brush parity with Cells paint, hydration, history, duplication, export`
  )
  const gradientMap = await page.evaluate(() => window.checkGradientMap())
  await Bun.write(
    resolve(artifacts, "gradient-map.png"),
    Buffer.from(gradientMap.png.split(",")[1], "base64")
  )
  await Bun.write(
    resolve(artifacts, "gradient-map-preview.webp"),
    Buffer.from(gradientMap.previewWebp.split(",")[1], "base64")
  )
  console.log(
    `PASS gradient map: ${gradientMap.samples} editor/runtime GPU cases, presets, amount, invert, masked group scope, hydration, export, catalog preview`
  )
  const lumenPrint = await page.evaluate(() => window.checkLumenPrint())
  for (const [style, png] of Object.entries(lumenPrint.styles))
    await Bun.write(
      resolve(artifacts, `lumen-print-${style}.png`),
      Buffer.from(png.split(",")[1], "base64")
    )
  await Bun.write(
    resolve(artifacts, "lumen-print-preview.webp"),
    Buffer.from(lumenPrint.previewWebp.split(",")[1], "base64")
  )
  console.log(
    `PASS lumen print: ${lumenPrint.samples} editor/runtime GPU cases, identity, solarize, washout, grain, styles, hydration, history, export, photo renders`
  )
  const signalRot = await page.evaluate(() => window.checkSignalRot())
  for (const [style, png] of Object.entries(signalRot.styles))
    await Bun.write(
      resolve(artifacts, `signal-rot-${style}.png`),
      Buffer.from(png.split(",")[1], "base64")
    )
  await Bun.write(
    resolve(artifacts, "signal-rot-preview.webp"),
    Buffer.from(signalRot.previewWebp.split(",")[1], "base64")
  )
  console.log(
    `PASS signal rot: ${signalRot.samples} editor/runtime GPU cases, identity, drag both directions, tear, dropout, chroma, crush, wobble, speed, styles, hydration, history, export, photo renders`
  )
  const artboard = await page.evaluate(() => window.checkArtboard())
  console.log(
    `PASS artboard: ${artboard.samples} document size, fit, composition update, save/reopen and legacy checks`
  )
  const shapes = await page.evaluate(() => window.checkShapeLayers())
  await Bun.write(
    resolve(artifacts, "shape-layers.png"),
    Buffer.from(shapes.png.split(",")[1], "base64")
  )
  console.log(
    `PASS shape layers: ${shapes.samples} editor/runtime GPU cases across seven shapes, outline, softness, blend, mask, hydration, export`
  )
  const textEditing = await page.evaluate(() => window.checkTextEditing())
  await Bun.write(
    resolve(artifacts, "text-editing.png"),
    Buffer.from(textEditing.png.split(",")[1], "base64")
  )
  console.log(
    `PASS text editing: ${textEditing.samples} editor/runtime checks for multiline, align, line height, rotation, small sizes, geometry helpers, hydration and export`
  )
  const blob = await page.evaluate(() => window.checkBlobTracking())
  console.log(
    `PASS blob tracking: ${blob.samples} tracker edge points, seeded labels, atlas glyphs, editor/runtime frames, brackets, edge dots, label modes, migration`
  )
  const annotations = await page.evaluate(() => window.checkAnnotations())
  await Bun.write(
    resolve(artifacts, "annotations.png"),
    Buffer.from(annotations.png.split(",")[1], "base64")
  )
  await Bun.write(
    resolve(artifacts, "annotations-preview.webp"),
    Buffer.from(annotations.previewWebp.split(",")[1], "base64")
  )
  console.log(
    `PASS annotations: ${annotations.samples} layout, placement, text, palette, editor/runtime render, hydration and export checks`
  )
  const depth = await page.evaluate(() => window.checkDepthParallax())
  await Bun.write(
    resolve(artifacts, "depth-parallax.png"),
    Buffer.from(depth.png.split(",")[1], "base64")
  )
  console.log(
    `PASS depth parallax: ${depth.samples} checks, editor/runtime GPU parity, occlusion march, edges, depth view, scene depth for effects and masks, motion, hydration, export, both pipelines`
  )
  console.log(
    `Depth media pass at 1080p (software adapter, median ms): ${JSON.stringify(depth.timing)}`
  )
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
