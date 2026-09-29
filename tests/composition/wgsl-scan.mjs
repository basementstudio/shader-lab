import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const VARIABLE = /\bnodeVar\d+\b/g
const ASSIGNMENT = /^\s*(nodeVar\d+)\s*=\s*(.*);\s*$/
const DECLARATION = /^\s*var\s+(nodeVar\d+)\s*:\s*[^=;]+(=\s*(.*))?;\s*$/

function uninitializedReads(text) {
  const flags = []
  let stack = null
  let fn = null
  const known = (name) => stack.some((block) => block.assigned.has(name))
  const check = (source, number, line) => {
    for (const name of source.match(VARIABLE) ?? []) {
      if (!known(name)) flags.push({ code: line, fn, line: number, name })
    }
  }
  text.split("\n").forEach((raw, index) => {
    const number = index + 1
    const line = raw.trim()
    if (stack === null) {
      const start = /^fn\s+(\w+)/.exec(line)
      if (start && line.endsWith("{")) {
        fn = start[1]
        stack = [{ assigned: new Set(), chain: null, kind: "fn" }]
      }
      return
    }
    if (line.startsWith("}")) {
      const rest = line.slice(1).trim()
      const closed = stack.pop()
      if (closed.chain) {
        closed.chain.arms.push(closed.assigned)
        if (closed.kind === "else" && stack.length > 0) {
          const [first, ...others] = closed.chain.arms
          for (const name of first) {
            if (others.every((arm) => arm.has(name))) stack.at(-1).assigned.add(name)
          }
        }
      }
      if (stack.length === 0) {
        stack = null
        fn = null
        return
      }
      if (rest.startsWith("else if")) {
        check(rest, number, line)
        stack.push({ assigned: new Set(), chain: closed.chain, kind: "elif" })
      } else if (rest.startsWith("else")) {
        stack.push({ assigned: new Set(), chain: closed.chain, kind: "else" })
      }
      return
    }
    const declaration = DECLARATION.exec(line)
    if (declaration) {
      if (declaration[2]) {
        check(declaration[3] ?? "", number, line)
        stack.at(-1).assigned.add(declaration[1])
      }
      return
    }
    const assignment = ASSIGNMENT.exec(line)
    check(assignment ? assignment[2] : line, number, line)
    if (assignment) stack.at(-1).assigned.add(assignment[1])
    if (line.endsWith("{")) {
      if (line.startsWith("if")) {
        stack.push({ assigned: new Set(), chain: { arms: [] }, kind: "if" })
      } else {
        stack.push({ assigned: new Set(), chain: null, kind: /^(for|loop|while)\b/.test(line) ? "loop" : "block" })
      }
    }
  })
  return flags
}

function scan(directory) {
  const byCheck = new Map()
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".wgsl")).sort()) {
    const check = file.split("-")[0]
    const patterns = byCheck.get(check) ?? new Map()
    byCheck.set(check, patterns)
    const seen = new Set()
    for (const flag of uninitializedReads(readFileSync(resolve(directory, file), "utf8"))) {
      if (seen.has(`${flag.fn}:${flag.name}`)) continue
      seen.add(`${flag.fn}:${flag.name}`)
      const pattern = `${flag.fn}: ${flag.code.replace(/nodeVar\d+/g, "V").replace(/nodeUniform\d+/g, "U").slice(0, 140)}`
      if (!patterns.has(pattern)) patterns.set(pattern, `${file}:${flag.line} ${flag.name}`)
    }
  }
  return byCheck
}

const [candidateDir, baselineDir] = process.argv.slice(2)
if (!candidateDir) {
  console.error("Usage: bun tests/composition/wgsl-scan.mjs <candidate-dir> [baseline-dir]")
  process.exit(2)
}
const candidate = scan(resolve(candidateDir))
const baseline = baselineDir ? scan(resolve(baselineDir)) : new Map()
let added = 0
for (const [check, patterns] of candidate) {
  const known = baseline.get(check) ?? new Map()
  const fresh = [...patterns].filter(([pattern]) => !known.has(pattern))
  if (fresh.length === 0) continue
  added += fresh.length
  console.log(`${check}: ${fresh.length} ${baselineDir ? "new " : ""}uninitialized read patterns`)
  for (const [pattern, where] of fresh) console.log(`  ${where}\n    ${pattern}`)
}
console.log(
  added === 0
    ? `No ${baselineDir ? "new " : ""}uninitialized reads.`
    : `${added} ${baselineDir ? "new " : ""}uninitialized read patterns.`
)
process.exit(added > 0 ? 1 : 0)
