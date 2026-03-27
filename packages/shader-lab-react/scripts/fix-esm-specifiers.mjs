import { readdir, readFile, writeFile } from "node:fs/promises"

const DIST_DIR = new URL("../dist/", import.meta.url)

const JS_IMPORT_PATTERN =
  /(from\s+["'])(\.\.?\/[^"']+)(["'])|(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g

async function collectJsFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const nextUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl)

      if (entry.isDirectory()) {
        return collectJsFiles(nextUrl)
      }

      return entry.name.endsWith(".js") ? [nextUrl] : []
    }),
  )

  return files.flat()
}

function withJsExtension(specifier) {
  return /\.[cm]?js$|\.json$|\.node$/.test(specifier) ? specifier : `${specifier}.js`
}

function rewriteSpecifiers(source) {
  return source.replace(
    JS_IMPORT_PATTERN,
    (match, fromPrefix, fromSpecifier, fromSuffix, importPrefix, importSpecifier, importSuffix) => {
      if (fromSpecifier) {
        return `${fromPrefix}${withJsExtension(fromSpecifier)}${fromSuffix}`
      }

      if (importSpecifier) {
        return `${importPrefix}${withJsExtension(importSpecifier)}${importSuffix}`
      }

      return match
    },
  )
}

const files = await collectJsFiles(DIST_DIR)

await Promise.all(
  files.map(async (fileUrl) => {
    const source = await readFile(fileUrl, "utf8")
    const rewritten = rewriteSpecifiers(source)

    if (rewritten !== source) {
      await writeFile(fileUrl, rewritten)
    }
  }),
)
