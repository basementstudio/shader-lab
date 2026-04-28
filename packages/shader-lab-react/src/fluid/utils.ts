import * as THREE from "three/webgpu"
import type { ShaderLabFluidControls, ShaderLabFluidSplatColor } from "./types"
import { defaultShaderLabFluidControls } from "./types"

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function getSimulationSize(
  resolution: number,
  aspectRatio: number
): {
  height: number
  width: number
} {
  if (aspectRatio >= 1) {
    return {
      height: Math.max(1, Math.round(resolution)),
      width: Math.max(1, Math.round(resolution * aspectRatio)),
    }
  }

  return {
    height: Math.max(1, Math.round(resolution / Math.max(aspectRatio, 0.0001))),
    width: Math.max(1, Math.round(resolution)),
  }
}

export function hsvToRgb(
  h: number,
  s: number,
  v: number
): ShaderLabFluidSplatColor {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  switch (i % 6) {
    case 0:
      return { b: p, g: t, r: v }
    case 1:
      return { b: p, g: v, r: q }
    case 2:
      return { b: t, g: v, r: p }
    case 3:
      return { b: v, g: q, r: p }
    case 4:
      return { b: v, g: p, r: t }
    default:
      return { b: q, g: p, r: v }
  }
}

export function randomVividColor(
  random: () => number
): ShaderLabFluidSplatColor {
  const color = hsvToRgb(random(), 1, 1)
  return { b: color.b * 0.15, g: color.g * 0.15, r: color.r * 0.15 }
}

export function hexToVector3(hex: string): THREE.Vector3 {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  const color = new THREE.Color(`#${value}`)
  return new THREE.Vector3(color.r, color.g, color.b)
}

export function normalizeShaderLabFluidControls(
  controls?: Partial<ShaderLabFluidControls>
): ShaderLabFluidControls {
  return {
    ...defaultShaderLabFluidControls,
    ...controls,
    autoSplats:
      typeof controls?.autoSplats === "boolean"
        ? controls.autoSplats
        : defaultShaderLabFluidControls.autoSplats,
    brightness:
      typeof controls?.brightness === "number"
        ? Math.max(0, controls.brightness)
        : defaultShaderLabFluidControls.brightness,
    colorMode:
      controls?.colorMode === "duotone" ||
      controls?.colorMode === "source" ||
      controls?.colorMode === "monochrome"
        ? controls.colorMode
        : defaultShaderLabFluidControls.colorMode,
    curlStrength:
      typeof controls?.curlStrength === "number"
        ? Math.max(0, controls.curlStrength)
        : defaultShaderLabFluidControls.curlStrength,
    densityDissipation:
      typeof controls?.densityDissipation === "number"
        ? Math.max(0, controls.densityDissipation)
        : defaultShaderLabFluidControls.densityDissipation,
    dyeRes:
      typeof controls?.dyeRes === "number"
        ? Math.max(16, Math.round(controls.dyeRes))
        : defaultShaderLabFluidControls.dyeRes,
    iterations:
      typeof controls?.iterations === "number"
        ? Math.max(1, Math.round(controls.iterations))
        : defaultShaderLabFluidControls.iterations,
    pressureDissipation:
      typeof controls?.pressureDissipation === "number"
        ? clamp(controls.pressureDissipation, 0, 1)
        : defaultShaderLabFluidControls.pressureDissipation,
    radius:
      typeof controls?.radius === "number"
        ? Math.max(0.001, controls.radius)
        : defaultShaderLabFluidControls.radius,
    seed:
      typeof controls?.seed === "number"
        ? Math.round(controls.seed) >>> 0
        : defaultShaderLabFluidControls.seed,
    simRes:
      typeof controls?.simRes === "number"
        ? Math.max(16, Math.round(controls.simRes))
        : defaultShaderLabFluidControls.simRes,
    splatForce:
      typeof controls?.splatForce === "number"
        ? Math.max(0, controls.splatForce)
        : defaultShaderLabFluidControls.splatForce,
    velocityDissipation:
      typeof controls?.velocityDissipation === "number"
        ? Math.max(0, controls.velocityDissipation)
        : defaultShaderLabFluidControls.velocityDissipation,
  }
}
