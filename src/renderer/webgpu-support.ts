/* Deliberately three-free: importers can probe WebGPU support without
 * pulling three/webgpu and the pass graph into their chunk. */
export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export type RendererSupport = {
  adapterFound: boolean
  hasGpuApi: boolean
  webgl2Available: boolean
}

/* Thrown before three is touched when neither backend can start. Without
 * it, three silently falls back to WebGL2 on a null context and crashes. */
export class RendererUnsupportedError extends Error {
  readonly support: RendererSupport

  constructor(support: RendererSupport) {
    super(
      "Your browser exposes WebGPU, but no GPU is available to render with. Enable hardware acceleration or try another browser."
    )
    this.name = "RendererUnsupportedError"
    this.support = support
  }
}

function canCreateWebGL2Context(): boolean {
  if (typeof document === "undefined") {
    return false
  }

  try {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2")
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}

/* `"gpu" in navigator` is true even when requestAdapter() resolves null
 * (GPU blocklisted, hardware acceleration off, headless). three then falls
 * back to WebGL2, which only works if a WebGL2 context can be created. */
export async function probeRendererSupport(): Promise<RendererSupport> {
  const hasGpuApi = browserSupportsWebGPU()
  let adapterFound = false

  if (hasGpuApi) {
    try {
      const gpu = (
        navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<unknown | null> }
        }
      ).gpu
      adapterFound = (await gpu?.requestAdapter()) != null
    } catch {
      adapterFound = false
    }
  }

  return {
    adapterFound,
    hasGpuApi,
    webgl2Available: adapterFound ? true : canCreateWebGL2Context(),
  }
}

export async function assertRendererSupported(): Promise<void> {
  const support = await probeRendererSupport()

  if (!(support.adapterFound || support.webgl2Available)) {
    throw new RendererUnsupportedError(support)
  }
}
