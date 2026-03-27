import type { TSLNode } from "three/tsl"
import * as tsl from "three/tsl"
import * as shaderUtils from "./shaders/tsl/utils/index"

type CompiledShaderModule = {
  buildNode: () => TSLNode
}

const PRELUDE = {
  ...tsl,
  ...shaderUtils,
}

const TRANSPILED_CACHE = new Map<string, string>()
let typescriptPromise: Promise<typeof import("typescript")> | null = null

function isNodeLike(value: unknown): value is TSLNode {
  return Boolean(
    value &&
      typeof value === "object" &&
      "mul" in value &&
      "add" in value &&
      "sub" in value
  )
}

function formatDiagnostics(
  compiler: typeof import("typescript"),
  diagnostics: readonly import("typescript").Diagnostic[] | undefined
): string | null {
  if (!(diagnostics && diagnostics.length > 0)) {
    return null
  }

  return diagnostics
    .map((diagnostic) =>
      compiler.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    )
    .join("\n\n")
}

function createSourceFile(
  compiler: typeof import("typescript"),
  fileName: string,
  sourceCode: string
) {
  return compiler.createSourceFile(
    fileName,
    sourceCode,
    compiler.ScriptTarget.ES2020,
    true,
    getScriptKind(compiler, fileName)
  )
}

function getSourceFileDiagnostics(sourceFile: import("typescript").SourceFile) {
  return (
    sourceFile as import("typescript").SourceFile & {
      parseDiagnostics?: readonly import("typescript").Diagnostic[]
    }
  ).parseDiagnostics
}

function isDirectiveStatement(
  compiler: typeof import("typescript"),
  statement: import("typescript").Statement
) {
  return (
    compiler.isExpressionStatement(statement) &&
    compiler.isStringLiteral(statement.expression) &&
    (statement.expression.text === "use client" ||
      statement.expression.text === "use server")
  )
}

function statementContainsJsx(
  compiler: typeof import("typescript"),
  statement: import("typescript").Statement
): boolean {
  let containsJsx = false

  const visit = (node: import("typescript").Node) => {
    if (
      compiler.isJsxElement(node) ||
      compiler.isJsxSelfClosingElement(node) ||
      compiler.isJsxFragment(node)
    ) {
      containsJsx = true
      return
    }

    compiler.forEachChild(node, visit)
  }

  compiler.forEachChild(statement, visit)

  return containsJsx
}

async function sanitizeCustomShaderSource({
  fileName,
  sourceCode,
}: {
  fileName: string
  sourceCode: string
}) {
  const compiler = await getTypeScript()
  const sourceFile = createSourceFile(compiler, fileName, sourceCode)
  const diagnosticsMessage = formatDiagnostics(
    compiler,
    getSourceFileDiagnostics(sourceFile)
  )

  if (diagnosticsMessage) {
    throw new Error(diagnosticsMessage)
  }

  const statements = sourceFile.statements.filter((statement) => {
    if (isDirectiveStatement(compiler, statement)) {
      return false
    }

    if (
      compiler.isImportDeclaration(statement) ||
      compiler.isImportEqualsDeclaration(statement) ||
      compiler.isExportAssignment(statement)
    ) {
      return false
    }

    if (
      compiler.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined
    ) {
      return false
    }

    if (statementContainsJsx(compiler, statement)) {
      return false
    }

    return true
  })

  const sanitizedFile = compiler.factory.updateSourceFile(
    sourceFile,
    statements
  )
  const printer = compiler.createPrinter({
    newLine: compiler.NewLineKind.LineFeed,
  })

  return `${printer.printFile(sanitizedFile).trim()}\n`
}

function assertNoExplicitImports(sourceCode: string) {
  if (/^\s*import[\s{*]/m.test(sourceCode)) {
    throw new Error(
      "Custom shader imports are resolved through the injected prelude. Remove the imports or paste the whole sketch file and let the custom shader layer strip them."
    )
  }
}

async function getTypeScript() {
  if (!typescriptPromise) {
    typescriptPromise = import("typescript")
  }

  return typescriptPromise
}

function getScriptKind(
  compiler: typeof import("typescript"),
  fileName: string
): import("typescript").ScriptKind {
  return fileName.endsWith(".tsx")
    ? compiler.ScriptKind.TSX
    : compiler.ScriptKind.TS
}

export async function formatCustomShaderSource({
  fileName,
  sourceCode,
}: {
  fileName?: string
  sourceCode: string
}): Promise<string> {
  const compiler = await getTypeScript()
  const resolvedFileName = fileName ?? "custom-shader.ts"
  const sourceFile = createSourceFile(compiler, resolvedFileName, sourceCode)
  const diagnosticsMessage = formatDiagnostics(
    compiler,
    getSourceFileDiagnostics(sourceFile)
  )

  if (diagnosticsMessage) {
    throw new Error(diagnosticsMessage)
  }

  const printer = compiler.createPrinter({
    newLine: compiler.NewLineKind.LineFeed,
  })

  return `${printer.printFile(sourceFile).trim()}\n`
}

export async function compileCustomShaderModule({
  entryExport,
  extraScope,
  fileName,
  force = false,
  sourceCode,
}: {
  entryExport: string
  extraScope?: Record<string, unknown>
  fileName?: string
  force?: boolean
  sourceCode: string
}): Promise<CompiledShaderModule> {
  const resolvedFileName = fileName ?? "custom-shader.ts"
  const sanitizedSourceCode = await sanitizeCustomShaderSource({
    fileName: resolvedFileName,
    sourceCode,
  })
  assertNoExplicitImports(sanitizedSourceCode)

  const cacheKey = `${entryExport}\n${resolvedFileName}\n${sanitizedSourceCode}`
  let outputText = !force ? (TRANSPILED_CACHE.get(cacheKey) ?? null) : null

  const compiler = await getTypeScript()
  if (!outputText) {
    const transpiled = compiler.transpileModule(sanitizedSourceCode, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: compiler.JsxEmit.ReactJSX,
        module: compiler.ModuleKind.CommonJS,
        target: compiler.ScriptTarget.ES2020,
      },
      fileName: resolvedFileName,
      reportDiagnostics: true,
    })
    const diagnosticsMessage = formatDiagnostics(
      compiler,
      transpiled.diagnostics
    )

    if (diagnosticsMessage) {
      throw new Error(diagnosticsMessage)
    }

    outputText = transpiled.outputText
    TRANSPILED_CACHE.set(cacheKey, outputText)
  }

  const runtimeScope = {
    ...PRELUDE,
    ...(extraScope ?? {}),
  }
  const scopeNames = Object.keys(runtimeScope)
  const scopeValues = scopeNames.map(
    (key) => runtimeScope[key as keyof typeof runtimeScope]
  )
  const module = { exports: {} as Record<string, unknown> }
  const exportsObject = module.exports
  const evaluator = new Function(
    "exports",
    "module",
    ...scopeNames,
    `${outputText}\nreturn module.exports;`
  )

  let resolvedExports: Record<string, unknown>

  try {
    resolvedExports = evaluator(
      exportsObject,
      module,
      ...scopeValues
    ) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Custom shader evaluation failed."
    )
  }

  const exported = resolvedExports[entryExport] ?? module.exports[entryExport]

  if (typeof exported !== "function") {
    throw new Error(
      `Expected a named export \`${entryExport}\` that resolves to a TSL sketch function.`
    )
  }

  return {
    buildNode: () => {
      const result = (exported as () => unknown)()

      if (!isNodeLike(result)) {
        throw new Error(
          `The export \`${entryExport}\` did not return a valid TSL node.`
        )
      }

      return result
    },
  }
}
