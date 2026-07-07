/**
 * Drift inventory generator for plan 006 (renderer deduplication).
 *
 * Compares the editor app trees (src/renderer, src/fluid) against the
 * published package trees (packages/shader-lab-react/src/renderer,
 * packages/shader-lab-react/src/fluid), recursively (includes shaders/tsl).
 *
 * For every file name appearing in either side it reports:
 *   - line counts on both sides
 *   - raw diff size (`diff a b | wc -l`)
 *   - normalized diff size, after (a) canonicalizing import specifiers on
 *     both sides to tree-root-relative paths (`@/renderer/pass-node` and
 *     `./pass-node` both become `renderer/pass-node`) and (b) running both
 *     sides through `biome format` with the repo config, so pure formatting
 *     drift (trailing commas, line wrapping) does not count as logic drift
 *   - a classification:
 *       IDENTICAL            — byte-identical
 *       IDENTICAL-MODULO-IMPORTS — normalized diff < 10 lines
 *       DRIFTED              — same role, real logic differences
 *       DIVERGED             — structurally different (>50% of the smaller
 *                              file differs, or >40% line-count delta)
 *       SINGLE-SIDED         — exists in one tree only
 *
 * Run with: bun plans/006-artifacts/generate-drift-inventory.ts
 * Output:   plans/006-artifacts/drift-inventory.md
 *
 * Throwaway analysis tooling — not production code.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, posix, relative } from "node:path"

const APP_ROOT = "src"
const PKG_ROOT = "packages/shader-lab-react/src"
const SUBTREES = ["renderer", "fluid"]

function listFiles(root: string, subtree: string): string[] {
  const results: string[] = []
  const base = join(root, subtree)

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries.sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith(".ts")) {
        results.push(relative(root, full))
      }
    }
  }

  walk(base)
  return results
}

/**
 * Canonicalize every import/export specifier in `source` to a path relative
 * to the tree root, so app alias imports and package relative imports
 * compare equal. `fileRel` is the file's path relative to the tree root.
 */
function canonicalizeImports(source: string, fileRel: string): string {
  const fileDir = dirname(fileRel)
  return source.replace(
    /(from\s+|import\s*\(\s*)["']([^"']+)["']/g,
    (_match, prefix: string, specifier: string) => {
      let canonical = specifier
      if (specifier.startsWith("@/")) {
        canonical = specifier.slice(2)
      } else if (specifier.startsWith(".")) {
        canonical = posix.normalize(posix.join(fileDir, specifier))
      }
      return `${prefix}"${canonical}"`
    }
  )
}

function biomeFormat(source: string): string {
  const proc = Bun.spawnSync(
    ["bun", "x", "biome", "format", "--stdin-file-path=normalized.ts"],
    { stdin: new TextEncoder().encode(source) }
  )
  const formatted = proc.stdout.toString()
  return proc.exitCode === 0 && formatted.length > 0 ? formatted : source
}

async function diffLineCount(left: string, right: string): Promise<number> {
  const leftPath = `/tmp/drift-left-${process.pid}.ts`
  const rightPath = `/tmp/drift-right-${process.pid}.ts`
  await Bun.write(leftPath, left)
  await Bun.write(rightPath, right)
  const diff = Bun.spawnSync(["diff", leftPath, rightPath])
  return diff.stdout.toString().split("\n").filter(Boolean).length
}

type Row = {
  appLines: number | null
  classification: string
  file: string
  normalizedDiff: number | null
  pkgLines: number | null
  rawDiff: number | null
}

const rows: Row[] = []
let appFileCount = 0
let pkgFileCount = 0

for (const subtree of SUBTREES) {
  const appFiles = listFiles(APP_ROOT, subtree)
  const pkgFiles = listFiles(PKG_ROOT, subtree)
  appFileCount += appFiles.length
  pkgFileCount += pkgFiles.length
  const union = [...new Set([...appFiles, ...pkgFiles])].sort()

  for (const file of union) {
    const appPath = join(APP_ROOT, file)
    const pkgPath = join(PKG_ROOT, file)
    const appExists = appFiles.includes(file)
    const pkgExists = pkgFiles.includes(file)

    if (!(appExists && pkgExists)) {
      rows.push({
        appLines: appExists
          ? readFileSync(appPath, "utf8").split("\n").length
          : null,
        classification: `SINGLE-SIDED (${appExists ? "app" : "package"} only)`,
        file,
        normalizedDiff: null,
        pkgLines: pkgExists
          ? readFileSync(pkgPath, "utf8").split("\n").length
          : null,
        rawDiff: null,
      })
      continue
    }

    const appSource = readFileSync(appPath, "utf8")
    const pkgSource = readFileSync(pkgPath, "utf8")
    const appLines = appSource.split("\n").length
    const pkgLines = pkgSource.split("\n").length
    const rawDiff = await diffLineCount(appSource, pkgSource)
    const normalizedDiff = await diffLineCount(
      biomeFormat(canonicalizeImports(appSource, file)),
      biomeFormat(canonicalizeImports(pkgSource, file))
    )

    let classification = "DRIFTED"
    if (rawDiff === 0) {
      classification = "IDENTICAL"
    } else if (normalizedDiff < 10) {
      classification = "IDENTICAL-MODULO-IMPORTS"
    } else {
      const smaller = Math.min(appLines, pkgLines)
      const delta = Math.abs(appLines - pkgLines) / Math.max(appLines, pkgLines)
      if (normalizedDiff > smaller * 0.5 || delta > 0.4) {
        classification = "DIVERGED"
      }
    }

    rows.push({
      appLines,
      classification,
      file,
      normalizedDiff,
      pkgLines,
      rawDiff,
    })
  }
}

const counts = new Map<string, number>()
for (const row of rows) {
  const key = row.classification.split(" ")[0] ?? row.classification
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

const lines: string[] = []
lines.push("# Renderer/fluid drift inventory (plan 006)")
lines.push("")
lines.push(`Generated by \`generate-drift-inventory.ts\` at commit HEAD.`)
lines.push("")
lines.push(
  `App files (src/renderer + src/fluid, recursive): **${appFileCount}**; ` +
    `package files (packages/shader-lab-react/src/renderer + fluid): **${pkgFileCount}**; ` +
    `union rows: **${rows.length}**.`
)
lines.push("")
lines.push(
  [...counts.entries()].map(([key, count]) => `${key}: ${count}`).join(" · ")
)
lines.push("")
lines.push(
  "Normalization: import/export specifiers on both sides are rewritten to " +
    "tree-root-relative paths before diffing (`@/renderer/pass-node` ≡ " +
    "`./pass-node`, `@/types/editor` ≡ `../types/editor`, etc.). " +
    "IDENTICAL-MODULO-IMPORTS means < 10 normalized diff lines; DIVERGED " +
    "means > 50% of the smaller file differs after normalization or the " +
    "line counts differ by > 40%."
)
lines.push("")
lines.push("| File | App lines | Pkg lines | Raw diff | Normalized diff | Classification |")
lines.push("| --- | ---: | ---: | ---: | ---: | --- |")
for (const row of rows) {
  lines.push(
    `| ${row.file} | ${row.appLines ?? "—"} | ${row.pkgLines ?? "—"} | ` +
      `${row.rawDiff ?? "—"} | ${row.normalizedDiff ?? "—"} | ${row.classification} |`
  )
}
lines.push("")

await Bun.write("plans/006-artifacts/drift-inventory.md", lines.join("\n"))
console.log(`Wrote ${rows.length} rows to plans/006-artifacts/drift-inventory.md`)
