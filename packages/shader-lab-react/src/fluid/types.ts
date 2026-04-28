import type * as THREE from "three/webgpu"

export type ShaderLabFluidColorMode = "duotone" | "monochrome" | "source"

export interface ShaderLabFluidControls {
  autoSplats: boolean
  brightness: number
  colorMode: ShaderLabFluidColorMode
  curlStrength: number
  densityDissipation: number
  dyeRes: number
  duotoneDark: string
  duotoneLight: string
  iterations: number
  monoDark: string
  monoLight: string
  paused: boolean
  pressureDissipation: number
  radius: number
  seed: number
  simRes: number
  splatForce: number
  velocityDissipation: number
}

export interface ShaderLabFluidSplatColor {
  b: number
  g: number
  r: number
}

export interface ShaderLabFluidRuntimeOptions {
  controls?: Partial<ShaderLabFluidControls>
  height?: number
  pixelRatio?: number
  renderer?: THREE.WebGPURenderer
  width?: number
}

export const defaultShaderLabFluidControls: ShaderLabFluidControls = {
  autoSplats: true,
  brightness: 1.6,
  colorMode: "monochrome",
  curlStrength: 30,
  densityDissipation: 4,
  dyeRes: 1024,
  duotoneDark: "#101010",
  duotoneLight: "#f3f3ef",
  iterations: 20,
  monoDark: "#000000",
  monoLight: "#ffffff",
  paused: false,
  pressureDissipation: 0,
  radius: 1,
  seed: 1337,
  simRes: 192,
  splatForce: 6000,
  velocityDissipation: 0.2,
}
