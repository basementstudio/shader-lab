import { beforeEach, describe, expect, test } from "bun:test"
import { emitCustomShaderCompileResult } from "@/lib/agent-bridge/compile-events"
import {
  executeAgentCommand,
  getAgentCommandNames,
} from "@/lib/agent-bridge/commands"
import { useLayerStore } from "@/store/layer-store"

type ProjectState = {
  compositionSize: { height: number; width: number }
  layers: {
    id: string
    index: number
    name: string
    type: string
    visible: boolean
  }[]
  selectedLayerId: string | null
}

async function run<T = Record<string, unknown>>(
  command: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return (await executeAgentCommand(command, payload)) as T
}

beforeEach(() => {
  useLayerStore.getState().replaceState([], null, null, [])
})

describe("structural commands", () => {
  test("get_project_state summarizes layers without params", async () => {
    await run("add_layer", { type: "gradient" })
    const state = await run<ProjectState>("get_project_state")

    expect(state.layers).toHaveLength(1)
    expect(state.layers[0]?.type).toBe("gradient")
    expect(state.layers[0]).not.toHaveProperty("params")
    expect(state.compositionSize.width).toBeGreaterThan(0)
  })

  test("add_layer creates, names, and selects the layer", async () => {
    const layer = await run<{ id: string; index: number; name: string }>(
      "add_layer",
      { name: "My Halftone", type: "halftone" }
    )

    expect(layer.name).toBe("My Halftone")
    expect(layer.index).toBe(0)

    const state = await run<ProjectState>("get_project_state")

    expect(state.selectedLayerId).toBe(layer.id)
  })

  test("add_layer honors insertIndex", async () => {
    const first = await run<{ id: string }>("add_layer", { type: "gradient" })
    const second = await run<{ id: string; index: number }>("add_layer", {
      insertIndex: 1,
      type: "halftone",
    })

    const state = await run<ProjectState>("get_project_state")

    expect(state.layers[0]?.id).toBe(first.id)
    expect(state.layers[1]?.id).toBe(second.id)
  })

  test("add_layer rejects unknown types listing valid ones", async () => {
    expect(run("add_layer", { type: "nonsense" })).rejects.toThrow(
      /Unknown layer type `nonsense`.*gradient/
    )
  })

  test("remove_layers rejects unknown ids without removing anything", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })

    expect(
      run("remove_layers", { ids: [layer.id, "ghost"] })
    ).rejects.toThrow(/ghost.*Nothing was removed/)

    const state = await run<ProjectState>("get_project_state")

    expect(state.layers).toHaveLength(1)
  })

  test("remove_layers removes layers", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })
    const state = await run<ProjectState>("remove_layers", {
      ids: [layer.id],
    })

    expect(state.layers).toHaveLength(0)
  })

  test("duplicate_layer inserts the copy after the source", async () => {
    const source = await run<{ id: string }>("add_layer", { type: "halftone" })
    const copy = await run<{ id: string; index: number }>("duplicate_layer", {
      id: source.id,
    })

    expect(copy.id).not.toBe(source.id)
    expect(copy.index).toBe(1)
  })

  test("reorder_layer moves a layer and validates the index", async () => {
    const bottom = await run<{ id: string }>("add_layer", { type: "gradient" })
    await run("add_layer", { type: "halftone" })

    const state = await run<ProjectState>("reorder_layer", {
      id: bottom.id,
      toIndex: 0,
    })

    expect(state.layers[0]?.id).toBe(bottom.id)

    expect(
      run("reorder_layer", { id: bottom.id, toIndex: 5 })
    ).rejects.toThrow(/between 0 and 1/)
  })

  test("rename_layer and set_layer_visibility update the layer", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })

    const renamed = await run<{ name: string }>("rename_layer", {
      id: layer.id,
      name: "Base",
    })

    expect(renamed.name).toBe("Base")

    const hidden = await run<{ visible: boolean }>("set_layer_visibility", {
      id: layer.id,
      visible: false,
    })

    expect(hidden.visible).toBe(false)
  })

  test("select_layer selects and clears", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })

    let state = await run<ProjectState>("select_layer", { id: layer.id })

    expect(state.selectedLayerId).toBe(layer.id)

    state = await run<ProjectState>("select_layer", {})

    expect(state.selectedLayerId).toBeNull()
  })

  test("unknown commands report the available command list", async () => {
    expect(run("explode")).rejects.toThrow(/Unknown command `explode`/)
    expect(getAgentCommandNames()).toContain("write_custom_shader")
  })
})

describe("layer property and param commands", () => {
  test("update_layer sets opacity and blend mode, rejects invalid modes", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })

    const updated = await run<{ blendMode: string; opacity: number }>(
      "update_layer",
      { blendMode: "multiply", id: layer.id, opacity: 0.5 }
    )

    expect(updated.opacity).toBe(0.5)
    expect(updated.blendMode).toBe("multiply")

    expect(
      run("update_layer", { blendMode: "nope", id: layer.id })
    ).rejects.toThrow(/Invalid blendMode/)
  })

  test("describe_layer_type serializes ranges and options, hides internals", async () => {
    const description = await run<{
      internalParamKeys: string[]
      params: {
        key: string
        max?: number
        min?: number
        options?: { value: string }[]
        type: string
      }[]
    }>("describe_layer_type", { type: "custom-shader" })

    expect(description.internalParamKeys).toContain("sourceCode")
    expect(
      description.params.some((param) => param.key === "sourceCode")
    ).toBe(false)

    const halftone = await run<{
      params: { key: string; options?: { value: string }[]; type: string }[]
    }>("describe_layer_type", { type: "halftone" })
    const selectParam = halftone.params.find(
      (param) => param.type === "select"
    )

    expect(selectParam?.options?.length).toBeGreaterThan(0)
  })

  test("update_layer_params applies, clamps, and rejects with reasons", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "halftone" })
    const description = await run<{
      params: {
        key: string
        max?: number
        min?: number
        type: string
      }[]
    }>("describe_layer_type", { type: "halftone" })
    const numberParam = description.params.find(
      (param) => param.type === "number" && param.max !== undefined
    )

    expect(numberParam).toBeDefined()

    const report = await run<{
      applied: string[]
      clamped: { key: string; to: number }[]
      rejected: { key: string; reason: string }[]
    }>("update_layer_params", {
      id: layer.id,
      params: {
        [numberParam?.key ?? ""]: (numberParam?.max ?? 0) + 1000,
        ghostKey: 1,
      },
    })

    expect(report.applied).toContain(numberParam?.key)
    expect(report.clamped[0]?.to).toBe(numberParam?.max as number)
    expect(report.rejected[0]?.key).toBe("ghostKey")
    expect(report.rejected[0]?.reason).toMatch(/unknown parameter/)
  })

  test("update_layer_params validates select options and value types", async () => {
    const layer = await run<{ id: string }>("add_layer", {
      type: "dithering",
    })

    const report = await run<{
      applied: string[]
      rejected: { key: string; reason: string }[]
    }>("update_layer_params", {
      id: layer.id,
      params: { algorithm: "not-a-real-algorithm", levels: "high" },
    })

    expect(report.applied).toHaveLength(0)
    expect(report.rejected).toHaveLength(2)
    expect(report.rejected.map((entry) => entry.key).sort()).toEqual([
      "algorithm",
      "levels",
    ])
    expect(
      report.rejected.find((entry) => entry.key === "algorithm")?.reason
    ).toMatch(/expected one of/)
  })

  test("reset_layer_params restores defaults", async () => {
    const layer = await run<{ id: string; params: Record<string, unknown> }>(
      "add_layer",
      { type: "halftone" }
    )
    const description = await run<{
      params: { defaultValue: unknown; key: string; type: string }[]
    }>("describe_layer_type", { type: "halftone" })
    const numberParam = description.params.find(
      (param) => param.type === "number"
    )
    const key = numberParam?.key ?? ""
    const defaultValue = numberParam?.defaultValue as number

    await run("update_layer_params", {
      id: layer.id,
      params: { [key]: defaultValue + 0.1 },
    })

    const reset = await run<{ params: Record<string, unknown> }>(
      "reset_layer_params",
      { id: layer.id }
    )

    expect(reset.params[key]).toBe(defaultValue)
  })
})

describe("custom shader commands", () => {
  test("get_custom_shader rejects non custom-shader layers", async () => {
    const layer = await run<{ id: string }>("add_layer", { type: "gradient" })

    expect(run("get_custom_shader", { layerId: layer.id })).rejects.toThrow(
      /not a custom shader/
    )
  })

  test("write_custom_shader creates a layer and resolves on the compile ack", async () => {
    const pending = run<{
      compiled: boolean
      error: string | null
      layerId: string
      revision: number
    }>("write_custom_shader", {
      sourceCode: "export const sketch = Fn(() => vec3(1))",
    })

    await Bun.sleep(10)

    const layer = useLayerStore
      .getState()
      .layers.find((entry) => entry.type === "custom-shader")

    expect(layer).toBeDefined()
    expect(layer?.params.sourceCode).toBe(
      "export const sketch = Fn(() => vec3(1))"
    )

    emitCustomShaderCompileResult({
      error: null,
      layerId: layer?.id ?? "",
      revision: (layer?.params.sourceRevision as number) ?? 1,
    })

    const result = await pending

    expect(result.compiled).toBe(true)
    expect(result.error).toBeNull()
    expect(result.layerId).toBe(layer?.id ?? "")
  })

  test("write_custom_shader relays compile errors", async () => {
    const pending = run<{ compiled: boolean; error: string | null }>(
      "write_custom_shader",
      {
        effectMode: true,
        sourceCode: "export const sketch = 42",
      }
    )

    await Bun.sleep(10)

    const layer = useLayerStore
      .getState()
      .layers.find((entry) => entry.type === "custom-shader")

    expect(layer?.params.effectMode).toBe(true)

    emitCustomShaderCompileResult({
      error: "Expected a named export `sketch`.",
      layerId: layer?.id ?? "",
      revision: (layer?.params.sourceRevision as number) ?? 1,
    })

    const result = await pending

    expect(result.compiled).toBe(false)
    expect(result.error).toMatch(/named export/)
  })

  test("write_custom_shader targets an existing layer and bumps the revision", async () => {
    const created = run<{ layerId: string; revision: number }>(
      "write_custom_shader",
      { sourceCode: "export const sketch = Fn(() => vec3(0))" }
    )

    await Bun.sleep(10)

    const layer = useLayerStore
      .getState()
      .layers.find((entry) => entry.type === "custom-shader")

    emitCustomShaderCompileResult({
      error: null,
      layerId: layer?.id ?? "",
      revision: (layer?.params.sourceRevision as number) ?? 1,
    })

    await created

    const second = run<{ revision: number }>("write_custom_shader", {
      layerId: layer?.id ?? "",
      sourceCode: "export const sketch = Fn(() => vec3(1))",
    })

    await Bun.sleep(10)

    const updated = useLayerStore
      .getState()
      .layers.find((entry) => entry.id === layer?.id)
    const revision = updated?.params.sourceRevision as number

    emitCustomShaderCompileResult({
      error: null,
      layerId: layer?.id ?? "",
      revision,
    })

    const result = await second

    expect(result.revision).toBe(revision)

    const shader = await run<{ sourceCode: string }>("get_custom_shader", {
      layerId: layer?.id ?? "",
    })

    expect(shader.sourceCode).toBe("export const sketch = Fn(() => vec3(1))")
  })
})
