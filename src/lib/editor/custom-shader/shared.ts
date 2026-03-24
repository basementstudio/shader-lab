export const CUSTOM_SHADER_INTERNAL_VISIBILITY = {
  equals: "__never__",
  key: "__customShaderInternal",
} as const

export const CUSTOM_SHADER_ENTRY_EXPORT = "sketch"

export const CUSTOM_SHADER_INTERNAL_KEYS = new Set([
  "entryExport",
  "sourceCode",
  "sourceFileName",
  "sourceMode",
  "sourceRevision",
])

export const CUSTOM_SHADER_STARTER = `export const sketch = Fn(() => {
  const uv0 = screenAspectUV(screenSize)
  const color = vec3(
    uv0.x.add(0.5),
    uv0.y.add(0.5),
    sin(time).mul(0.5).add(0.5)
  ).toVar()

  color.assign(technicolorTonemap(color))

  return color
})
`
