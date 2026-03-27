import type { ShaderLabConfig } from "@basementstudio/shader-lab"

const DEFAULT_COMPONENT_NAME = "ExportedShader"

export function generateShaderExportSnippet(
  config: ShaderLabConfig,
  componentName = DEFAULT_COMPONENT_NAME
): string {
  const safeComponentName = sanitizeShaderExportComponentName(componentName)
  const serializedConfig = JSON.stringify(config, null, 2)

  return [
    'import { ShaderLabComposition, type ShaderLabConfig } from "@basementstudio/shader-lab"',
    "",
    `const config: ShaderLabConfig = ${serializedConfig}`,
    "",
    `export function ${safeComponentName}() {`,
    "  return <ShaderLabComposition config={config} />",
    "}",
    "",
  ].join("\n")
}

export function sanitizeShaderExportComponentName(input: string): string {
  const collapsed = input.replace(/[^a-zA-Z0-9]+/g, " ").trim()
  const parts =
    collapsed.length > 0 ? collapsed.split(/\s+/) : [DEFAULT_COMPONENT_NAME]
  const candidate = parts
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")

  if (!(candidate && /^[A-Z]/.test(candidate))) {
    return DEFAULT_COMPONENT_NAME
  }

  return candidate
}
