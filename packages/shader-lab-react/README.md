# @shader-lab/react

<a href="https://basement.studio"><img alt="basement.studio logo" src="https://img.shields.io/badge/MADE%20BY%20basement.studio-000000.svg?style=for-the-badge&labelColor=000"></a>
<a href="https://www.npmjs.com/package/@shader-lab/react"><img alt="NPM version" src="https://img.shields.io/npm/v/%40shader-lab%2Freact.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://basement.studio"><img alt="Website" src="https://img.shields.io/badge/WEBSITE-basement.studio-a6d600.svg?style=for-the-badge&labelColor=000000"></a>

`@shader-lab/react` is a portable React runtime for rendering Shader Lab compositions exported from the editor.

## Overview

- Render exported Shader Lab configs inside React apps
- Play Shader Lab timelines at runtime
- Support Shader Lab source and effect layers in a standalone runtime
- Use exported compositions without shipping the full editor

## Install

```bash
npm install @shader-lab/react three
```

```bash
bun add @shader-lab/react three
```

## Peer Dependencies

- `react`
- `react-dom`
- `three`

## Usage

```tsx
"use client"

import { ShaderLabComposition, type ShaderLabConfig } from "@shader-lab/react"

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

Listen for runtime errors:

```tsx
<ShaderLabComposition
  config={config}
  onRuntimeError={(message) => {
    console.error(message)
  }}
/>
```

## Component API

### `ShaderLabComposition`

| Prop | Description |
| --- | --- |
| `config` | Exported `ShaderLabConfig` object |
| `className` | Optional wrapper class name |
| `style` | Optional wrapper styles |
| `onRuntimeError` | Optional callback for initialization or asset-loading errors |

## Exports

- `ShaderLabComposition`
- `createRuntimeClock`
- `advanceRuntimeClock`
- `buildRuntimeFrame`
- `evaluateTimelineForLayers`
- `resolveEvaluatedLayers`
- runtime config and timeline types

## Notes

- `ShaderLabComposition` is a client component and should be used from a `"use client"` module
- The component fills the width of its container and preserves the exported composition aspect ratio
- WebGPU support is required in the browser
- Media source layers expect accessible asset URLs in `layer.asset.src`

## Included Runtime Support

- Gradient
- Text
- Custom shader
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

## Links

- Website: [basement.studio](https://basement.studio/)
- npm: [@shader-lab/react](https://www.npmjs.com/package/@shader-lab/react)
