/* Deliberately three-free: importers can probe WebGPU support without
 * pulling three/webgpu and the pass graph into their chunk. */
export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}
