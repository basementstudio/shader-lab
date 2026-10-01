import { createHash } from "node:crypto"
import { mkdir, readdir, rm } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { chromium } from "playwright"

const root = resolve(import.meta.dir, "../..")
const directory = resolve(import.meta.dir)
const threeDir = process.env.THREE_DIR ? resolve(process.env.THREE_DIR) : null
const label = process.env.LABEL ?? "current"
const only = process.env.CHECKS ? new Set(process.env.CHECKS.split(",")) : null
const output = resolve(root, ".context/wgsl", label)
await rm(output, { force: true, recursive: true })
await mkdir(output, { recursive: true })

const entries = { "": "build/three.module.js", "/tsl": "build/three.tsl.js", "/webgpu": "build/three.webgpu.js" }
const plugins = threeDir
  ? [
      {
        name: "three-version",
        setup(build) {
          build.onResolve({ filter: /^three(\/.*)?$/ }, (args) => {
            const subpath = args.path.slice("three".length)
            if (subpath in entries) return { path: resolve(threeDir, entries[subpath]) }
            return { path: resolve(threeDir, subpath.replace(/^\/addons\//, "/examples/jsm/").replace(/^\//, "")) }
          })
        },
      },
    ]
  : []
const bundle = await Bun.build({
  define: { "process.env": "{}" },
  entrypoints: [resolve(directory, "browser.mjs")],
  plugins,
  target: "browser",
})
if (!bundle.success) throw new AggregateError(bundle.logs, "Composition harness failed to bundle")

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/")
      return new Response(
        `<!doctype html><style>@font-face { font-family: "Fixture Mono"; src: url("/fonts/geist/Geist-Mono.woff2"); font-weight: 100 900; } :root { --geist-mono: "Fixture Mono"; }</style><script type="module" src="/browser.js"></script>`,
        { headers: { "Content-Type": "text/html" } }
      )
    if (path === "/browser.js")
      return new Response(bundle.outputs[0], { headers: { "Content-Type": "text/javascript" } })
    if (path === "/scenes/default/alpha-sample.svg")
      return new Response(Bun.file(resolve(directory, "fixtures/alpha-sample.svg")))
    if (path === "/scenes/default/dof-study.png" || path === "/scenes/default/dof-study-depth.png")
      return new Response(Bun.file(resolve(directory, `fixtures/${path.split("/").pop()}`)))
    if (path === "/scenes/default/rings-photo.webp")
      return new Response(Bun.file(resolve(root, "public/examples/effects/slice.webp")))
    if (/^\/scenes\/default\/(motif|shape)-[a-z-]+\.svg$/.test(path))
      return new Response(Bun.file(resolve(directory, `fixtures/${path.split("/").pop()}`)))
    const base = path.startsWith("/fixtures/") || path.startsWith("/baselines/") ? directory : resolve(root, "public")
    const file = resolve(base, `.${path}`)
    if (!(file.startsWith(`${base}${sep}`) && (await Bun.file(file).exists())))
      return new Response("Not found", { status: 404 })
    return new Response(Bun.file(file))
  },
})

const projects = (await readdir(resolve(directory, "baselines")))
  .filter((name) => name.endsWith(".png"))
  .map((name) => name.replace(/\.png$/, ""))
const browser = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  headless: true,
})
const seen = new Set()
let failures = 0
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(600_000)
  await page.addInitScript(() => {
    window.__capturedWgsl = []
    const create = GPUDevice.prototype.createShaderModule
    GPUDevice.prototype.createShaderModule = function (descriptor) {
      window.__capturedWgsl.push(descriptor.code)
      return create.call(this, descriptor)
    }
  })
  await page.goto(server.url.href)
  await page.waitForFunction(() => typeof window.checkProject === "function")
  await page.evaluate(() => document.fonts.load('400 96px "Fixture Mono"'))
  const save = async (name) => {
    const codes = await page.evaluate(() => window.__capturedWgsl.splice(0))
    let added = 0
    for (const code of codes) {
      const hash = createHash("sha1").update(code).digest("hex").slice(0, 12)
      if (seen.has(hash)) continue
      seen.add(hash)
      added += 1
      await Bun.write(resolve(output, `${name}-${hash}.wgsl`), code)
    }
    return added
  }
  const run = async (name, action) => {
    let status = "ok"
    try {
      await action()
    } catch (error) {
      failures += 1
      status = `FAIL ${String(error?.message ?? error).split("\n")[0].slice(0, 200)}`
    }
    console.log(`${name}: ${status}, ${await save(name)} new shaders`)
  }
  if (!only) {
    for (const project of projects) {
      await run(`project-${project}`, () =>
        page.evaluate((name) => window.checkProject(name, false), project)
      )
    }
  }
  const checks = await page.evaluate(() =>
    Object.keys(window).filter(
      (key) => key.startsWith("check") && key !== "checkProject" && typeof window[key] === "function"
    )
  )
  for (const check of checks) {
    if (only && !only.has(check)) continue
    await run(check, () => page.evaluate((name) => window[name](), check))
  }
  console.log(`${seen.size} shaders in ${output}`)
} finally {
  await browser.close()
  server.stop(true)
}
process.exit(failures > 0 ? 1 : 0)
