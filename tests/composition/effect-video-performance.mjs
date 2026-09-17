// Run with bun tests/composition/effect-video-performance.mjs; opt-in, not a CI threshold.
import { chromium } from "playwright"
const bundle = await Bun.build({
  entrypoints: ["tests/composition/effect-video-performance-browser.mjs"],
  target: "browser",
})
if (!bundle.success) throw new AggregateError(bundle.logs)
const server = Bun.serve({
  port: 0,
  fetch: (r) => {
    const path = new URL(r.url).pathname
    if (path === "/aura.mp4")
      return new Response(Bun.file("public/scenes/default/aura.mp4"))
    if (path === "/app.js")
      return new Response(bundle.outputs[0], {
        headers: { "Content-Type": "text/javascript" },
      })
    return new Response('<script type="module" src="/app.js"></script>', {
      headers: { "Content-Type": "text/html" },
    })
  },
})
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu"],
})
try {
  const page = await browser.newPage()
  page.on("pageerror", console.error)
  await page.goto(server.url.href)
  await page.waitForFunction(() => window.run)
  const scatterOnly = process.argv.includes("--scatter")
  const result = await page.evaluate(
    (scatterOnly) => window.run({ scatterOnly }),
    scatterOnly
  )
  console.log(JSON.stringify(result, null, 2))
  await Bun.write(
    scatterOnly
      ? ".context/scatter-video-performance.json"
      : ".context/effect-video-performance.json",
    JSON.stringify(result, null, 2)
  )
} finally {
  await browser.close()
  server.stop(true)
}
