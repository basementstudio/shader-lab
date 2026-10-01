// Run with bun tests/composition/blob-motion-probe.mjs; diagnostic, not a CI check.
import { chromium } from "playwright"
const bundle = await Bun.build({
  entrypoints: ["tests/composition/blob-motion-probe-browser.mjs"],
  target: "browser",
})
if (!bundle.success) throw new AggregateError(bundle.logs)
const server = Bun.serve({
  port: 0,
  fetch: (r) => {
    const path = new URL(r.url).pathname
    if (path === "/aura.mp4") return new Response(Bun.file("public/scenes/default/aura.mp4"))
    if (path === "/app.js") return new Response(bundle.outputs[0], { headers: { "Content-Type": "text/javascript" } })
    return new Response('<script type="module" src="/app.js"></script>', { headers: { "Content-Type": "text/html" } })
  },
})
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu"] })
try {
  const page = await browser.newPage()
  page.on("pageerror", console.error)
  await page.goto(server.url.href)
  await page.waitForFunction(() => window.run)
  const result = await page.evaluate(() => window.run())
  console.log(JSON.stringify(result, null, 2))
  await Bun.write(process.argv[2] ?? ".context/blob-motion-probe.json", JSON.stringify(result, null, 2))
} finally {
  await browser.close()
  server.stop(true)
}
