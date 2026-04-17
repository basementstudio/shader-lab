import {
  abs,
  clamp,
  dot,
  float,
  max,
  min,
  mix,
  select,
  sqrt,
  step,
  type TSLNode,
  vec3,
  vec4,
} from "three/tsl"

type Node = TSLNode

function normal(_base: Node, blend: Node): Node {
  return blend
}

function multiply(base: Node, blend: Node): Node {
  return base.mul(blend)
}

function screen(base: Node, blend: Node): Node {
  return float(1).sub(float(1).sub(base).mul(float(1).sub(blend)))
}

function overlay(base: Node, blend: Node): Node {
  const dark = float(2).mul(base).mul(blend)
  const light = float(1).sub(
    float(2).mul(float(1).sub(base)).mul(float(1).sub(blend)),
  )

  return select(base.lessThan(float(0.5)), dark, light)
}

function darken(base: Node, blend: Node): Node {
  return min(base, blend)
}

function lighten(base: Node, blend: Node): Node {
  return max(base, blend)
}

function colorDodge(base: Node, blend: Node): Node {
  return clamp(base.div(max(float(1).sub(blend), float(1e-6))), vec3(0), vec3(1))
}

function colorBurn(base: Node, blend: Node): Node {
  return clamp(
    float(1).sub(float(1).sub(base).div(max(blend, float(1e-6)))),
    vec3(0),
    vec3(1),
  )
}

function hardLight(base: Node, blend: Node): Node {
  return overlay(blend, base)
}

function softLight(base: Node, blend: Node): Node {
  const darkResult = base.sub(
    float(1).sub(float(2).mul(blend)).mul(base).mul(float(1).sub(base)),
  )
  const twoBlendMinusOne = float(2).mul(blend).sub(float(1))
  const dLow = float(16).mul(base).sub(float(12)).mul(base).add(float(4)).mul(base)
  const dHigh = sqrt(base)
  const d = select(base.lessThanEqual(float(0.25)), dLow, dHigh)
  const lightResult = base.add(twoBlendMinusOne.mul(d.sub(base)))

  return select(blend.lessThanEqual(float(0.5)), darkResult, lightResult)
}

function difference(base: Node, blend: Node): Node {
  return abs(base.sub(blend))
}

function exclusion(base: Node, blend: Node): Node {
  return base.add(blend).sub(float(2).mul(base).mul(blend))
}

function lum(color: Node): Node {
  return dot(color, vec3(0.2126, 0.7152, 0.0722))
}

function clipColor(color: Node): Node {
  const luma = lum(color)
  const colorMin = min(color.x, min(color.y, color.z))
  const lowClipped = color
    .sub(luma)
    .mul(luma.div(max(luma.sub(colorMin), float(1e-6))))
    .add(luma)
  const lowAdjusted = select(colorMin.lessThan(float(0)), lowClipped, color)
  const maxAfterLow = max(lowAdjusted.x, max(lowAdjusted.y, lowAdjusted.z))
  const excess = maxAfterLow.sub(float(1))
  const highClipped = lowAdjusted
    .sub(luma)
    .mul(float(1).sub(luma).div(max(excess, float(1e-6))))
    .add(luma)

  return select(maxAfterLow.greaterThan(float(1)), highClipped, lowAdjusted)
}

function setLum(color: Node, nextLum: Node): Node {
  return clipColor(color.add(nextLum.sub(lum(color))))
}

function sat(color: Node): Node {
  return max(color.x, max(color.y, color.z)).sub(min(color.x, min(color.y, color.z)))
}

function setSat(color: Node, nextSat: Node): Node {
  const red = color.x
  const green = color.y
  const blue = color.z
  const colorMin = min(red, min(green, blue))
  const colorMax = max(red, max(green, blue))
  const delta = colorMax.sub(colorMin)
  const scale = select(delta.greaterThan(float(0)), nextSat.div(delta), float(0))
  const redOut = select(
    red.lessThanEqual(colorMin),
    float(0),
    select(red.greaterThanEqual(colorMax), nextSat, red.sub(colorMin).mul(scale)),
  )
  const greenOut = select(
    green.lessThanEqual(colorMin),
    float(0),
    select(green.greaterThanEqual(colorMax), nextSat, green.sub(colorMin).mul(scale)),
  )
  const blueOut = select(
    blue.lessThanEqual(colorMin),
    float(0),
    select(blue.greaterThanEqual(colorMax), nextSat, blue.sub(colorMin).mul(scale)),
  )

  return vec3(redOut, greenOut, blueOut)
}

function hue(base: Node, blend: Node): Node {
  return setLum(setSat(blend, sat(base)), lum(base))
}

function saturation(base: Node, blend: Node): Node {
  return setLum(setSat(base, sat(blend)), lum(base))
}

function color(base: Node, blend: Node): Node {
  return setLum(blend, lum(base))
}

function luminosity(base: Node, blend: Node): Node {
  return setLum(base, lum(blend))
}

export function buildBlendColorNode(mode: string, base: Node, blend: Node): Node {
  switch (mode) {
    case "multiply":
      return multiply(base, blend)
    case "screen":
      return screen(base, blend)
    case "overlay":
      return overlay(base, blend)
    case "darken":
      return darken(base, blend)
    case "lighten":
      return lighten(base, blend)
    case "color-dodge":
      return colorDodge(base, blend)
    case "color-burn":
      return colorBurn(base, blend)
    case "hard-light":
      return hardLight(base, blend)
    case "soft-light":
      return softLight(base, blend)
    case "difference":
      return difference(base, blend)
    case "exclusion":
      return exclusion(base, blend)
    case "hue":
      return hue(base, blend)
    case "saturation":
      return saturation(base, blend)
    case "color":
      return color(base, blend)
    case "luminosity":
      return luminosity(base, blend)
    default:
      return normal(base, blend)
  }
}

export type MaskNodeConfig = {
  invert: boolean
  mode: string
  source: string
}

export function buildBlendNode(
  mode: string,
  base: Node,
  blend: Node,
  opacity: Node,
  compositeMode: "filter" | "mask" = "filter",
  maskConfig?: MaskNodeConfig,
): Node {
  const baseRgb = base.rgb
  const baseAlpha = float(clamp(base.a, float(0), float(1)))
  const blendRgb = blend.rgb
  const normalizedOpacity = float(clamp(opacity, float(0), float(1)))
  const blendAlpha = float(clamp(blend.a, float(0), float(1)))
  const composited = buildBlendColorNode(mode, baseRgb, blendRgb)

  if (compositeMode === "filter") {
    const effectiveBlendAlpha = normalizedOpacity.mul(blendAlpha)
    const resultAlpha = effectiveBlendAlpha.add(
      baseAlpha.mul(float(1).sub(effectiveBlendAlpha))
    )
    const premultipliedRgb = baseRgb
      .mul(baseAlpha)
      .mul(float(1).sub(effectiveBlendAlpha))
      .add(composited.mul(effectiveBlendAlpha))
    const resultRgb = select(
      resultAlpha.greaterThan(float(1e-6)),
      premultipliedRgb.div(resultAlpha),
      vec3(0)
    )

    return vec4(resultRgb, resultAlpha)
  }

  const source = maskConfig?.source ?? "luminance"
  let maskValue: Node
  switch (source) {
    case "alpha":
      maskValue = float(blend.a)
      break
    case "red":
      maskValue = float(blendRgb.x).mul(blendAlpha)
      break
    case "green":
      maskValue = float(blendRgb.y).mul(blendAlpha)
      break
    case "blue":
      maskValue = float(blendRgb.z).mul(blendAlpha)
      break
    default:
      maskValue = float(dot(blendRgb, vec3(0.2126, 0.7152, 0.0722))).mul(
        blendAlpha
      )
      break
  }

  if (maskConfig?.invert) {
    maskValue = float(1).sub(maskValue)
  }

  const maskStrength = mix(float(1), clamp(maskValue, float(0), float(1)), normalizedOpacity)

  const maskMode = maskConfig?.mode ?? "multiply"
  if (maskMode === "stencil") {
    const stencilStrength = step(float(0.5), maskStrength)

    return vec4(
      baseRgb.mul(stencilStrength),
      baseAlpha.mul(stencilStrength)
    )
  }

  return vec4(baseRgb.mul(maskStrength), baseAlpha.mul(maskStrength))
}
