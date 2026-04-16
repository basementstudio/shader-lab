# @basementstudio/shader-lab

<a href="https://basement.studio"><img alt="basement.studio logo" src="https://img.shields.io/badge/MADE%20BY%20basement.studio-000000.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://www.npmjs.com/package/@basementstudio/shader-lab"><img alt="NPM version" src="https://img.shields.io/npm/v/%40basementstudio%2Fshader-lab.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://basement.studio"><img alt="Website" src="https://img.shields.io/badge/WEBSITE-basement.studio-a6d600.svg?style=for-the-badge&labelColor=000000"></a>

`@basementstudio/shader-lab` is a portable React runtime for Shader Lab compositions exported from the editor.

It supports three main use cases:

- Render a composition directly in React
- Use a composition as a texture in your own scene
- Use Shader Lab effect layers as postprocessing over your own scene

## Install

```bash
npm install @basementstudio/shader-lab three
```

```bash
bun add @basementstudio/shader-lab three
```

## Peer Dependencies

- `react`
- `react-dom`
- `three`

## Requirements

- The runtime requires WebGPU support in the browser
- `ShaderLabComposition` and the hooks in this package are client-side APIs
- Media layers expect accessible asset URLs in `layer.asset.src`
- Composition texture output is canvas-backed and can be consumed by WebGL or WebGPU host scenes
- Postprocessing must run on the same `WebGPURenderer` as the scene texture you pass in

Supported effect layers include ASCII, CRT, directional blur, dithering, halftone, ink, particle grid, pattern, pixelation, pixel sorting, posterize, slice, edge detect, displacement map, and chromatic aberration.

## API Overview

### High-level API

- `ShaderLabComposition`
- `useShaderLab`

### Advanced APIs

- `useShaderLabCanvasSource`
- `useShaderLabPostProcessingSource`
- `useShaderLabTextureSource`
- `ShaderLabCanvasSource`
- `ShaderLabPostProcessingSource`
- `ShaderLabTextureSource`

Use `useShaderLab` unless you specifically need manual timing or lifecycle control.

## 1. Render a Composition

```tsx
"use client"

import {
  ShaderLabComposition,
  type ShaderLabConfig,
} from "@basementstudio/shader-lab"

const config: ShaderLabConfig = {
  composition: {
    width: 1512,
    height: 909,
  },
  layers: [],
  timeline: {
    duration: 6,
    loop: true,
    tracks: [],
  },
}

export default function Example() {
  return (
    <div style={{ width: "100%", maxWidth: 1200 }}>
      <ShaderLabComposition config={config} />
    </div>
  )
}
```

Handle runtime errors:

```tsx
<ShaderLabComposition
  config={config}
  onRuntimeError={(message) => {
    console.error(message)
  }}
/>
```

## 2. Use a Composition as a Texture

`useShaderLab` can manage the runtime and return a ready-to-use `THREE.CanvasTexture`.

```tsx
"use client"

import {
  useShaderLab,
  type ShaderLabConfig,
} from "@basementstudio/shader-lab"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"
import { WebGPURenderer } from "three/webgpu"

function Scene({ config }: { config: ShaderLabConfig }) {
  const { texture } = useShaderLab(config, {
    width: 1024,
    height: 1024,
  })

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    []
  )
  const meshRef = useRef<THREE.Mesh | null>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3
    }

    if (texture) {
      texture.needsUpdate = true
      material.map = texture
      material.needsUpdate = true
    }
  })

  return (
    <>
      <color attach="background" args={["#0a0a0a"]} />
      <PerspectiveCamera makeDefault fov={50} position={[0, 0, 4]} />
      <mesh ref={meshRef} material={material}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
      <OrbitControls enableDamping />
    </>
  )
}

export function TexturedExample({ config }: { config: ShaderLabConfig }) {
  return (
    <Canvas
      gl={async (props) => {
        const renderer = new WebGPURenderer(
          props as ConstructorParameters<typeof WebGPURenderer>[0]
        )
        await renderer.init()
        return renderer
      }}
    >
      <Scene config={config} />
    </Canvas>
  )
}
```

### Texture Notes

- `texture` is backed by the package's internal output canvas
- `canvas` is also available from `useShaderLab` if you want to integrate at the raw canvas level
- The runtime updates the composition for you internally
- This texture path is portable across WebGL and WebGPU host scenes because the package output is canvas-backed

## 3. Use Shader Lab as Postprocessing

For postprocessing, `useShaderLab` exposes a `postprocessing` handle.

You render your scene into a texture, then hand that texture to Shader Lab.

```tsx
"use client"

import {
  useShaderLab,
  type ShaderLabConfig,
} from "@basementstudio/shader-lab"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerspectiveCamera } from "@react-three/drei"
import { createPortal } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { float, texture as tslTexture, uv, vec2 } from "three/tsl"
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu"

function PostProcessedScene({ config }: { config: ShaderLabConfig }) {
  const { gl, scene, size } = useThree()
  const renderer = gl as unknown as WebGPURenderer
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneTargetRef = useRef<THREE.WebGLRenderTarget | null>(null)

  const { postprocessing } = useShaderLab(config, {
    renderer,
    width: size.width,
    height: size.height,
  })

  const presentScene = useMemo(() => new THREE.Scene(), [])
  const presentCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  )
  const presentTextureNode = useMemo(() => {
    const sampleUv = vec2(uv().x, float(1).sub(uv().y))
    return tslTexture(new THREE.Texture(), sampleUv)
  }, [])
  const presentMaterial = useMemo(() => {
    const material = new MeshBasicNodeMaterial()
    material.colorNode = presentTextureNode.rgb
    return material
  }, [presentTextureNode])

  useEffect(() => {
    const target = new THREE.WebGLRenderTarget(size.width, size.height)
    sceneTargetRef.current = target

    return () => {
      sceneTargetRef.current = null
      target.dispose()
    }
  }, [size.height, size.width])

  useEffect(() => {
    sceneTargetRef.current?.setSize(size.width, size.height)
    postprocessing.resize(size.width, size.height)
  }, [postprocessing, size.height, size.width])

  useFrame((state, delta) => {
    const target = sceneTargetRef.current
    const camera = cameraRef.current
    if (!(target && camera && postprocessing.ready)) return

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)

    const output = postprocessing.render(
      target.texture,
      state.clock.elapsedTime,
      delta
    )

    if (output) {
      presentTextureNode.value = output
    }

    renderer.setRenderTarget(null)
    renderer.render(presentScene, presentCamera)
  }, 1)

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 2, 5]} />

      <mesh position={[-1.2, 0, 0]}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial color="#e74c3c" />
      </mesh>

      <mesh position={[1.2, 0, 0]}>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial color="#3498db" />
      </mesh>

      {createPortal(
        <mesh frustumCulled={false}>
          <planeGeometry args={[2, 2]} />
          <primitive attach="material" object={presentMaterial} />
        </mesh>,
        presentScene
      )}
    </>
  )
}

export function PostProcessingExample({
  config,
}: {
  config: ShaderLabConfig
}) {
  return (
    <Canvas
      gl={async (props) => {
        const renderer = new WebGPURenderer(
          props as ConstructorParameters<typeof WebGPURenderer>[0]
        )
        await renderer.init()
        return renderer
      }}
    >
      <PostProcessedScene config={config} />
    </Canvas>
  )
}
```

### Postprocessing Notes

- Postprocessing is same-renderer only
- Pass your scene texture from the same `WebGPURenderer` you gave to `useShaderLab`
- WebGL host renderers are not supported for postprocessing
- Effect-only Shader Lab configs are the most natural fit here
- Keep the postprocessing `width`/`height` and `postprocessing.resize(...)` in sync with the input render target size, especially for screen-space effects like dithering, pixelation, and ASCII
- `postprocessing.texture` always points to the latest output texture

## `useShaderLab`

```ts
const { canvas, ready, texture, postprocessing } = useShaderLab(config, options)
```

### Options

| Option | Description |
| --- | --- |
| `width` | Output width for the internal runtime |
| `height` | Output height for the internal runtime |
| `pixelRatio` | Optional pixel ratio override |
| `canvas` | Optional existing canvas to render the composition into |
| `renderer` | Optional shared `WebGPURenderer` used for postprocessing |

### Return Value

| Field | Description |
| --- | --- |
| `canvas` | Internal output canvas |
| `ready` | `true` when the managed texture path is initialized |
| `texture` | Managed `THREE.CanvasTexture` backed by the runtime canvas |
| `postprocessing` | Handle for same-renderer postprocessing |

### `postprocessing`

| Field | Description |
| --- | --- |
| `ready` | `true` when the postprocessing source is initialized |
| `texture` | Latest processed output texture |
| `resize(width, height, pixelRatio?)` | Resize the runtime targets |
| `render(inputTexture, time, delta)` | Render Shader Lab effects into an output texture |

## Advanced APIs

These APIs are available when you want more direct control over timing, resize behavior, or object lifecycle.

Use them when:

- You already have your own render loop and want to drive updates manually
- You want the raw output canvas instead of a managed `CanvasTexture`
- You want to own the full postprocessing pipeline yourself
- You need to use the runtime outside React (but still in a browser/client runtime)

### Hooks

- `useShaderLabCanvasSource`
- `useShaderLabPostProcessingSource`
- `useShaderLabTextureSource`
- `useShaderLabTexture`

#### `useShaderLabCanvasSource`

Use this when you want the raw canvas and manual timing.

```tsx
const { canvas, ready, resize, update } = useShaderLabCanvasSource(config, {
  width: 1024,
  height: 1024,
})

useFrame((state, delta) => {
  if (!ready) return
  update(state.clock.elapsedTime, delta)
})
```

This is useful when:

- You want to create your own `THREE.CanvasTexture`
- You want to feed the canvas into some other pipeline
- You want to decide exactly when the composition updates

#### `useShaderLabPostProcessingSource`

Use this when you want to control the full scene-to-texture-to-screen flow yourself.

```tsx
const { ready, error, resize, texture, update } =
  useShaderLabPostProcessingSource(effectConfig, {
    renderer,
    width: size.width,
    height: size.height,
  })

useFrame((state, delta) => {
  if (!(ready && sceneTarget)) return

  renderer.setRenderTarget(sceneTarget)
  renderer.render(scene, camera)

  const output = update(
    sceneTarget.texture,
    state.clock.elapsedTime,
    delta
  )

  renderer.setRenderTarget(null)
  // present(output)
})
```

Make sure the Shader Lab postprocessing source is resized whenever your scene render target size changes. Screen-space effects use that size to determine their sampling grid.

This is useful when:

- You already have your own render targets
- You want to decide how the final output is presented
- You need lower-level access than `useShaderLab().postprocessing`

#### `useShaderLabTextureSource`

This exposes the lower-level internal texture source.

Use it only if you specifically want that internal texture path and understand the renderer constraints. For most cases, `useShaderLab` or `useShaderLabCanvasSource` is the better choice.

### Classes

- `ShaderLabCanvasSource`
- `ShaderLabPostProcessingSource`
- `ShaderLabTextureSource`

The class APIs are the non-React equivalents of the hooks.

Typical flow:

```ts
const source = new ShaderLabCanvasSource(config, {
  width: 1024,
  height: 1024,
})

await source.initialize()
source.update(time, delta)
source.resize(width, height)
source.dispose()
```

Use the classes when:

- You are outside React
- You want full manual lifecycle control
- You are integrating Shader Lab into a custom runtime or framework

## Custom Shader Layer

The custom shader layer lets you write GPU shaders using [Three.js TSL (Three Shading Language)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language). Your sketch runs entirely on the GPU as a node graph — there is no GLSL or WGSL to write.

### How it works

Your code must export a function wrapped in `Fn()` that returns a TSL node (vec3 or vec4). The editor compiles your TypeScript, strips imports, and evaluates the result in a sandbox with a pre-injected scope. Everything from `three/tsl` and the Shader Lab utility library is available as globals — no imports needed.

```ts
export const sketch = Fn(() => {
  const color = vec3(uv().x, uv().y, sin(time).mul(0.5).add(0.5))
  return color
})
```

Click **Apply** (or re-paste) to recompile. The entry export name defaults to `sketch` but can be changed in the Entry Export field.

### Source mode vs Effect mode

The custom shader layer has an **Effect Mode** toggle:

- **Source mode** (default) — the layer generates pixels from scratch, like a gradient or image. Your sketch outputs a color for each pixel. The output is linearized (sRGB → linear via `pow(2.2)`) to match the compositing pipeline.

- **Effect mode** — the layer acts as a post-processing effect. It receives the composited result of all layers below it via `inputTexture` and transforms it. No gamma conversion is applied since the input is already in linear space.

### Injected scope

These variables are injected into your sketch and available as globals:

| Variable | Type | Description |
| --- | --- | --- |
| `time` | `float` | Elapsed time in seconds, continuously updated |
| `inputTexture` | `TextureNode` | The composited layers below (effect mode). In source mode this is a blank texture. Use directly for the default-UV color, or call `.sample(customUV)` to re-sample at custom coordinates |

### TSL globals

Everything exported from `three/tsl` is available. Key ones:

| Function | Description |
| --- | --- |
| `Fn(() => { ... })` | Defines a deferred shader function (required wrapper) |
| `float`, `vec2`, `vec3`, `vec4` | Constructors for scalar and vector types |
| `uv()` | Fragment UV coordinates (0–1) |
| `screenSize` | Viewport resolution as vec2 |
| `sin`, `cos`, `abs`, `floor`, `round`, `pow`, `mix`, `clamp`, `smoothstep`, `dot`, `min`, `max` | Standard math |
| `texture(tex, uv)` | Sample a texture at given UVs |
| `uniform(value)` | Create a uniform node |
| `select(cond, a, b)` | Ternary selection |
| `If(cond, () => { ... }).Else(...)` | Conditional branching with `.toVar()` assignments |

Nodes are chained with methods: `a.add(b)`, `a.mul(b)`, `a.sub(b)`, `a.div(b)`, `a.negate()`, `a.toVar()` (makes mutable), `a.assign(b)` (mutates a toVar node).

### Shader Lab utilities

These are additional helpers injected alongside TSL:

#### Noise

| Function | Signature | Description |
| --- | --- | --- |
| `simplexNoise3d` | `(vec3) → float` | 3D simplex noise |
| `simplexNoise4d` | `(vec4) → float` | 4D simplex noise (use `.w` for time) |
| `perlinNoise3d` | `(vec3) → float` | 3D Perlin noise |
| `valueNoise3d` | `(vec3) → float` | 3D value noise |
| `voronoiNoise3d` | `(vec3) → vec2` | 3D Voronoi (`.x` = cell dist, `.y` = edge dist) |
| `fbm` | `(vec3) → float` | Fractal Brownian motion (2-octave simplex) |
| `curlNoise3d` | `(vec3) → vec3` | 3D curl noise |
| `curlNoise4d` | `(vec4) → vec3` | 4D curl noise |
| `ridgeNoise` | `(vec3) → float` | Ridge noise |
| `turbulence` | `(vec3) → float` | Turbulence noise |

#### Tonemapping

| Function | Signature | Description |
| --- | --- | --- |
| `reinhardTonemap` | `(vec3) → vec3` | Reinhard tonemap |
| `acesTonemap` | `(vec3) → vec3` | ACES filmic tonemap |
| `technicolorTonemap` | `(vec3) → vec3` | Warm technicolor look |
| `cinematicTonemap` | `(vec3) → vec3` | Cinematic S-curve with tint |
| `bleachBypassTonemap` | `(vec3) → vec3` | Desaturated high-contrast |
| `crossProcessTonemap` | `(vec3) → vec3` | Cross-process color shift |
| `totosTonemap` | `(vec3) → vec3` | Basement's custom filmic tonemap |

#### SDF primitives

| Function | Signature | Description |
| --- | --- | --- |
| `sdBox2d` | `(vec2, float) → float` | 2D box signed distance |
| `sdSphere` | `(vec3, float) → float` | 3D sphere signed distance |
| `sdDiamond` | `(vec2, float) → float` | 2D diamond signed distance |
| `sdRhombus` | `(vec2, vec2) → float` | 2D rhombus signed distance |

#### Math & space

| Function | Signature | Description |
| --- | --- | --- |
| `screenAspectUV` | `(screenSize, range?) → vec2` | Aspect-corrected UVs centered at origin |
| `rotate` | `(vec2, float) → vec2` | 2D rotation by angle (radians) |
| `smin` | `(float, float, float) → float` | Smooth minimum |
| `smax` | `(float, float, float) → float` | Smooth maximum |
| `atan2` | `(float, float) → float` | Two-argument arctangent |
| `tanh` | `(float) → float` | Hyperbolic tangent |
| `sinh` | `(float) → float` | Hyperbolic sine |
| `cosh` | `(float) → float` | Hyperbolic cosine |
| `cosinePalette` | `(t, a, b, c, d, e?) → vec3` | Cosine-based color palette generator |

#### Complex math

All complex operations use `vec2` where `.x` = real, `.y` = imaginary:

`complexMul`, `complexDiv`, `complexPow`, `complexSqrt`, `complexSin`, `complexCos`, `complexTan`, `complexLog`, `complexConj`, `complexToPolar`, `complexMobius`

#### Patterns

| Function | Signature | Description |
| --- | --- | --- |
| `bloom` | `(float) → float` | Soft glow curve |
| `bloomEdgePattern` | `(float, float, float) → float` | Edge-aware bloom |
| `canvasWeavePattern` | `(vec2, float) → float` | Woven canvas texture |
| `grainTexturePattern` | `(vec2) → float` | Film grain texture |
| `repeatingPattern` | `(vec2, float) → vec2` | Tiling UV helper |

### Examples

Source mode — animated gradient with tonemap:

```ts
export const sketch = Fn(() => {
  const uv0 = screenAspectUV(screenSize)
  const color = vec3(
    uv0.x.add(0.5),
    uv0.y.add(0.5),
    sin(time).mul(0.5).add(0.5)
  ).toVar()
  color.assign(technicolorTonemap(color))
  return color
})
```

Effect mode — sample input at custom UVs with distortion:

```ts
export const sketch = Fn(() => {
  const warp = sin(uv().y.mul(20).add(time.mul(2))).mul(0.02)
  const warped = vec2(uv().x.add(warp), uv().y)
  return inputTexture.sample(warped)
})
```

Effect mode — simple color manipulation:

```ts
export const sketch = Fn(() => {
  const color = inputTexture.toVar()
  const luma = dot(color.rgb, vec3(0.299, 0.587, 0.114))
  return vec4(vec3(luma), color.a)
})
```

## Included Runtime Support

- Gradient
- Text
- Custom shader (source and effect modes)
- Image and video sources
- Live camera input
- ASCII
- Pattern
- Ink
- Halftone
- Dithering
- CRT
- Particle grid
- Pixel sorting

## Utility Exports

- `createRuntimeClock`
- `advanceRuntimeClock`
- `buildRuntimeFrame`
- `evaluateTimelineForLayers`
- `resolveEvaluatedLayers`
- Runtime config and timeline types

## Notes

- `ShaderLabComposition` preserves the exported aspect ratio and fills its container width
- `useShaderLab` is the recommended entry point for most app integrations
- If you only need direct composition rendering in the DOM, use `ShaderLabComposition`
- If you need full manual control, use the lower-level source APIs
- Texture output is portable because it is backed by a managed canvas
- Postprocessing currently requires a shared `THREE.WebGPURenderer`
- If you use React Three Fiber with `three@0.183.x`, you may see a `THREE.Clock` deprecation warning from `@react-three/fiber`; that warning is upstream and not emitted by this package

## Links

- Website: [basement.studio](https://basement.studio/)
- npm: [@basementstudio/shader-lab](https://www.npmjs.com/package/@basementstudio/shader-lab)
