# @basementstudio/shader-lab

## 1.3.7

### Patch Changes

- 8678fd0: sync the package text runtime with the latest text layer updates and fix npm provenance publishing by declaring the repository url

## 1.3.6

### Patch Changes

- 9ad4873: Improve the timeline editor with multi-keyframe selection, marquee selection, keyboard editing shortcuts, and track toggles. Add curve editing and new easings, per keyframe.
- Sync the package text runtime with the newer text layer canvas rendering behavior, including logical-size scaling, anchor/offset placement, and background alpha support. Fix npm provenance publishing by declaring the package repository URL.

## 1.3.5

### Patch Changes

- 45227dc: minor fixes in pattern and ascii layers

## 1.3.4

### Patch Changes

- 34c1436: new circuit bent shader pass, crt version 2.0

## 1.3.3

### Patch Changes

- 72491d0: ascii pass improvements

## 1.3.2

### Patch Changes

- 95e78ee: srgb-fix

## 1.3.1

### Patch Changes

- a7eafe4: fix dithering color conversion

## 1.3.0

### Minor Changes

- fc1bf5d: Support custom shader layers running in effect mode. When `effectMode` is enabled in layer params, the shader receives `inputTexture` (the composited layers below) and skips sRGB-to-linear conversion since the input is already linear.

## 1.2.4

### Patch Changes

- 2e85f79: performance fixes

## 1.2.3

### Patch Changes

- 878a432: fix colorspace correction for media (imgs, videos...), per-layer adjustment for custom shaders

## 1.2.2

### Patch Changes

- ad9cd7d: perf improvements: -52% allocation pressure, -37% gpu overhead, -24% cpu per frame

## 1.2.1

### Patch Changes

- ab760fa: performance improvements

## 1.2.0

### Minor Changes

- adbbc04: Add directional blur, posterize, slice effect layers and more to the package

## 1.1.2

### Patch Changes

- 02e331f: new core layer effects

## 1.1.1

### Patch Changes

- 9803868: masking

## 1.1.0

### Minor Changes

- 9dbf768: high-level and advanced apis added to support other use cases

## 1.0.2

### Patch Changes

- b86e1f6: fix
- 6e5377b: fix package publishing so only @basementstudio/shader-lab is released from the workspace package

## 1.0.1

### Patch Changes

- 9a5c8d0: fix workflow

## 1.0.0

### Major Changes

- b878ba0: Publish the first release of `@basementstudio/shader-lab`.

  This package provides the Shader Lab runtime for rendering exported Shader Lab compositions in React apps.
