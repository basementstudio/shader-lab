export interface CustomShaderCompileResult {
  error: string | null
  layerId: string
  revision: number
}

type CompileListener = (result: CustomShaderCompileResult) => void

const listeners = new Set<CompileListener>()

export function subscribeToCustomShaderCompiles(
  listener: CompileListener
): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function emitCustomShaderCompileResult(
  result: CustomShaderCompileResult
): void {
  for (const listener of listeners) {
    listener(result)
  }
}
