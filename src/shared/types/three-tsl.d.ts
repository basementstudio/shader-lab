declare module "three/tsl" {
  export interface LoopConfig {
    condition?: string
    end: number
    start: number
    type: "float" | "int"
  }

  export type ShaderNodeParams = readonly [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode?,
    ...TSLNode[],
  ]

  export type ShaderNodeFn = (params: ShaderNodeParams, ...rest: unknown[]) => unknown

  export interface TSLNode {
    a: TSLNode
    b: TSLNode
    dot(value: unknown): TSLNode
    g: TSLNode
    r: TSLNode
    rgb: TSLNode
    value: unknown
    w: TSLNode
    x: TSLNode
    xx: TSLNode
    xy: TSLNode
    xyz: TSLNode
    xxxx: TSLNode
    xxyy: TSLNode
    xxx: TSLNode
    xzx: TSLNode
    xzyw: TSLNode
    y: TSLNode
    yyy: TSLNode
    yyyy: TSLNode
    yyz: TSLNode
    yzx: TSLNode
    yzw: TSLNode
    z: TSLNode
    zw: TSLNode
    zww: TSLNode
    zxy: TSLNode
    zzww: TSLNode
    www: TSLNode
    wyz: TSLNode

    add(value: unknown): TSLNode
    addAssign(value: unknown): TSLNode
    and(value: unknown): TSLNode
    assign(value: unknown): TSLNode
    clamp(min?: unknown, max?: unknown): TSLNode
    div(value: unknown): TSLNode
    equal(value: unknown): TSLNode
    fract(): TSLNode
    length(): TSLNode
    greaterThan(value: unknown): TSLNode
    greaterThanEqual(value: unknown): TSLNode
    lessThan(value: unknown): TSLNode
    lessThanEqual(value: unknown): TSLNode
    mul(value: unknown): TSLNode
    mulAssign(value: unknown): TSLNode
    negate(): TSLNode
    normalize(): TSLNode
    sqrt(): TSLNode
    sub(value: unknown): TSLNode
    toVar(): TSLNode
  }

  export function attribute(name: string, type: string): TSLNode
  export const pointUV: TSLNode
  export const positionLocal: TSLNode

  export const EPSILON: TSLNode
  export const PI: TSLNode
  export function abs(value: unknown): TSLNode
  export function add(left: unknown, right: unknown): TSLNode
  export function clamp(value: unknown, min?: unknown, max?: unknown): TSLNode
  export function cos(value: unknown): TSLNode
  export function cross(left: unknown, right: unknown): TSLNode
  export function dot(left: unknown, right: unknown): TSLNode
  export function Fn(
    fn: ShaderNodeFn,
    layout?: unknown,
  ): (...args: unknown[]) => TSLNode
  export function Loop(config: LoopConfig, callback: (...args: unknown[]) => unknown): TSLNode
  export function exp(value: unknown): TSLNode
  export function fract(value: unknown): TSLNode
  export function float(value?: unknown): TSLNode
  export function floor(value: unknown): TSLNode
  export function mat2(a?: unknown, b?: unknown, c?: unknown, d?: unknown): TSLNode
  export function max(left: unknown, right: unknown): TSLNode
  export function min(left: unknown, right: unknown): TSLNode
  export function mix(left: unknown, right: unknown, factor: unknown): TSLNode
  export function mod(left: unknown, right: unknown): TSLNode
  export function mul(left: unknown, right: unknown): TSLNode
  export const screenSize: TSLNode
  export function select(
    condition: unknown,
    whenTrue: unknown,
    whenFalse: unknown,
  ): TSLNode
  export function sin(value: unknown): TSLNode
  export function smoothstep(edge0: unknown, edge1: unknown, x: unknown): TSLNode
  export function sqrt(value: unknown): TSLNode
  export function pow(base: unknown, exponent: unknown): TSLNode
  export function step(edge: unknown, value: unknown): TSLNode
  export function sub(left: unknown, right: unknown): TSLNode
  export function texture(value: unknown, uv?: unknown): TSLNode
  export function uniform(value?: unknown): TSLNode
  export function uv(): TSLNode
  export function vec2(x?: unknown, y?: unknown): TSLNode
  export function vec3(x?: unknown, y?: unknown, z?: unknown): TSLNode
  export function vec4(
    x?: unknown,
    y?: unknown,
    z?: unknown,
    w?: unknown,
  ): TSLNode
}
