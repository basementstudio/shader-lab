import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const SHADER_CONTRACT = `# Custom shader contract

Shader Lab custom shaders are TSL (Three.js Shading Language) sketches evaluated
in a sandbox. The rules:

- Export a named \`sketch\` function: \`export const sketch = Fn(() => { ... })\`.
- The sketch must return a TSL node: a \`vec3\` color, or a \`vec4\` if you need alpha.
  Output is clamped to [0, 1].
- NO import statements. The entire TSL API plus Shader Lab's house utilities are
  pre-injected as globals (imports and JSX are stripped by the sanitizer; an
  explicit \`import\` is a hard error).
- Extra globals beyond three/tsl:
  - \`time\` — uniform, seconds since playback start
  - \`inputTexture\` — effect mode only: the layer stack below, sample with
    \`inputTexture.sample(vec2(x, y))\` (flip Y: \`vec2(x, float(1).sub(y))\`)
  - all house utilities (see the noise/color/patterns/sdf/complex/math sections)
- Source mode (effectMode=false) generates imagery from scratch; the returned
  color is treated as sRGB and converted to linear (pow 2.2). Effect mode
  (effectMode=true) transforms \`inputTexture\` and skips that conversion.
- TSL is a node graph builder, not immediate JS: use \`.toVar()\` before
  \`.assign()\`, use \`If(cond, () => {...}).Else(() => {...})\` instead of JS
  if/else for GPU branches, and \`select(cond, a, b)\` for ternaries. Plain JS
  loops and helper arrow functions ARE allowed — they run at graph build time
  and unroll into the shader.
- Uniform-like animation comes from \`time\`; there is no frame state between
  invocations.
`

interface UtilEntry {
  exportNames: string[]
  modulePath: string
}

interface UtilSection {
  entries: UtilEntry[]
  summary: string
  title: string
}

const UTIL_SECTION_ORDER = [
  "noise",
  "color",
  "patterns",
  "sdf",
  "complex",
  "math",
] as const

type UtilSectionName = (typeof UTIL_SECTION_ORDER)[number]

const UTIL_SECTION_META: Record<
  UtilSectionName,
  { summary: string; title: string }
> = {
  color: {
    summary: "Tonemapping curves and cosine palette generator",
    title: "Color utilities",
  },
  complex: {
    summary: "Complex-number math on vec2 (Mobius, pow, log, trig)",
    title: "Complex-number utilities",
  },
  math: {
    summary:
      "General math helpers: rotation, aspect-corrected UVs, smooth min/max, hyperbolic and atan2",
    title: "Math utilities",
  },
  noise: {
    summary:
      "Noise generators: simplex/perlin/value/voronoi/ridge 3D, simplex/curl 4D, fbm, turbulence",
    title: "Noise utilities",
  },
  patterns: {
    summary: "Procedural patterns: bloom, weave, grain, repetition",
    title: "Pattern utilities",
  },
  sdf: {
    summary: "Signed distance functions: box 2D/3D, sphere, diamond, rhombus",
    title: "SDF utilities",
  },
}

let repoRoot: string | null = null

function resolveRepoRoot(): string {
  if (repoRoot) {
    return repoRoot
  }

  let dir = process.cwd()

  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, "packages", "shader-lab-mcp"))) {
      repoRoot = dir
      return dir
    }

    const parent = dirname(dir)

    if (parent === dir) {
      break
    }

    dir = parent
  }

  throw new Error(
    "Could not locate the shader-lab repo root. Run the MCP server from inside the repo (e.g. `bun run mcp` at the repo root)."
  )
}

function tslShadersRoot(): string {
  return join(resolveRepoRoot(), "src", "renderer", "shaders", "tsl")
}

function classifyModulePath(modulePath: string): UtilSectionName {
  if (modulePath.includes("/noise/")) {
    return "noise"
  }

  if (modulePath.includes("/color/") || modulePath.includes("cosine-palette")) {
    return "color"
  }

  if (modulePath.includes("/patterns/")) {
    return "patterns"
  }

  if (modulePath.includes("/utils/sd-")) {
    return "sdf"
  }

  if (modulePath.includes("/utils/complex-")) {
    return "complex"
  }

  return "math"
}

async function readUtilBarrel(): Promise<Map<UtilSectionName, UtilEntry[]>> {
  const barrelSource = await readFile(
    join(tslShadersRoot(), "utils", "index.ts"),
    "utf8"
  )
  const sections = new Map<UtilSectionName, UtilEntry[]>()
  const exportPattern =
    /export\s*\{([^}]+)\}\s*from\s*"@\/renderer\/shaders\/tsl\/([^"]+)"/g

  for (const match of barrelSource.matchAll(exportPattern)) {
    const namesGroup = match[1]
    const modulePath = match[2]

    if (!(namesGroup && modulePath)) {
      continue
    }

    const exportNames = namesGroup
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
    const section = classifyModulePath(`/${modulePath}`)
    const entries = sections.get(section) ?? []

    entries.push({ exportNames, modulePath })
    sections.set(section, entries)
  }

  return sections
}

function stripImportLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*import[\s{]/.test(line))
    .join("\n")
    .trimStart()
}

async function readUtilSource(modulePath: string): Promise<string> {
  const relativePath = modulePath.replace("renderer/shaders/tsl/", "")
  const source = await readFile(
    join(tslShadersRoot(), `${relativePath}.ts`),
    "utf8"
  )

  return stripImportLines(source)
}

async function readStarters(): Promise<{ effect: string; source: string }> {
  const sharedSource = await readFile(
    join(
      resolveRepoRoot(),
      "src",
      "lib",
      "editor",
      "custom-shader",
      "shared.ts"
    ),
    "utf8"
  )
  const extract = (constant: string): string => {
    const pattern = new RegExp(
      `export const ${constant} = \`([\\s\\S]*?)\`\\n`
    )
    const match = sharedSource.match(pattern)

    return match?.[1] ?? "// starter unavailable"
  }

  return {
    effect: extract("CUSTOM_EFFECT_STARTER"),
    source: extract("CUSTOM_SHADER_STARTER"),
  }
}

let tslExportNamesPromise: Promise<string[]> | null = null

function getTslExportNames(): Promise<string[]> {
  if (!tslExportNamesPromise) {
    tslExportNamesPromise = import("three/tsl").then((module) =>
      Object.keys(module).sort()
    )
  }

  return tslExportNamesPromise
}

let utilSectionsPromise: Promise<Map<UtilSectionName, UtilSection>> | null =
  null

function getUtilSections(): Promise<Map<UtilSectionName, UtilSection>> {
  if (!utilSectionsPromise) {
    utilSectionsPromise = readUtilBarrel().then((grouped) => {
      const sections = new Map<UtilSectionName, UtilSection>()

      for (const name of UTIL_SECTION_ORDER) {
        const entries = grouped.get(name) ?? []

        sections.set(name, {
          entries,
          summary: UTIL_SECTION_META[name].summary,
          title: UTIL_SECTION_META[name].title,
        })
      }

      return sections
    })
  }

  return utilSectionsPromise
}

export const SHADER_REFERENCE_SECTIONS = [
  ...UTIL_SECTION_ORDER,
  "tsl-core",
  "examples",
] as const

export type ShaderReferenceSection =
  (typeof SHADER_REFERENCE_SECTIONS)[number]

function isUtilSectionName(value: string): value is UtilSectionName {
  return (UTIL_SECTION_ORDER as readonly string[]).includes(value)
}

async function buildOverview(): Promise<string> {
  const [tslNames, utilSections] = await Promise.all([
    getTslExportNames(),
    getUtilSections(),
  ])
  const lines: string[] = [SHADER_CONTRACT, "# Available API", ""]

  for (const name of UTIL_SECTION_ORDER) {
    const section = utilSections.get(name)

    if (!section) {
      continue
    }

    const exportNames = section.entries.flatMap((entry) => entry.exportNames)

    lines.push(
      `## ${section.title} (section: \`${name}\`)`,
      section.summary,
      `Globals: ${exportNames.join(", ")}`,
      ""
    )
  }

  lines.push(
    "## three/tsl core (section: `tsl-core`)",
    `${tslNames.length} exports are injected as globals — the full TSL node API (uv, vec2/3/4, float, sin, mix, Fn, If, select, texture, screenSize, ...). Request the \`tsl-core\` section for the complete name list.`,
    "",
    "## Worked examples (section: `examples`)",
    "Two known-good starters: a source-mode sketch and an effect-mode sketch.",
    "",
    "Request a section with `get_shader_api_reference({ section: \"noise\" })` to see full util sources."
  )

  return lines.join("\n")
}

async function buildUtilSection(name: UtilSectionName): Promise<string> {
  const utilSections = await getUtilSections()
  const section = utilSections.get(name)

  if (!section) {
    return `No utilities found for section \`${name}\`.`
  }

  const lines: string[] = [
    `# ${section.title}`,
    section.summary,
    "",
    "All functions below are available as globals in custom shaders (no imports). Sources shown with imports stripped:",
    "",
  ]

  for (const entry of section.entries) {
    const source = await readUtilSource(entry.modulePath)

    lines.push(`## ${entry.exportNames.join(", ")}`, "```ts", source, "```", "")
  }

  return lines.join("\n")
}

async function buildTslCoreSection(): Promise<string> {
  const tslNames = await getTslExportNames()

  return [
    "# three/tsl core exports",
    "",
    `All ${tslNames.length} exports below are injected as globals. This is the standard Three.js TSL API for this repo's three version:`,
    "",
    tslNames.join(", "),
  ].join("\n")
}

async function buildExamplesSection(): Promise<string> {
  const starters = await readStarters()

  return [
    "# Worked examples",
    "",
    "## Source mode (generates imagery from scratch)",
    "```ts",
    starters.source.trim(),
    "```",
    "",
    "## Effect mode (transforms the layers below via `inputTexture`)",
    "```ts",
    starters.effect.trim(),
    "```",
  ].join("\n")
}

export async function getShaderApiReference(section?: string): Promise<string> {
  if (!section) {
    return buildOverview()
  }

  if (section === "tsl-core") {
    return buildTslCoreSection()
  }

  if (section === "examples") {
    return buildExamplesSection()
  }

  if (isUtilSectionName(section)) {
    return buildUtilSection(section)
  }

  return `Unknown section \`${section}\`. Valid sections: ${SHADER_REFERENCE_SECTIONS.join(", ")}.`
}
