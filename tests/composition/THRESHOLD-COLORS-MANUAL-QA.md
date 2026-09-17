# Threshold palette

Roadmap 2.5.1. Reference reviewed: **01, Lovedance red/blue** from [the visual guide](../../V3-VISUAL-REFERENCES.md). This slice enables strong two-color photographic separation. It does not add the reference's geometric collage, lighting or typography.

## Focused test

1. Add Threshold above a photograph. Its initial black/white appearance should match previous versions.
2. Set **Dark Color** to blue (`#162FC4`) and **Light Color** to pink (`#F04E9B`). The same tonal regions should take those colors. Threshold and Noise retain their behavior; Softness blends between the two chosen colors.
3. Toggle **Invert**: the colors trade regions. Undo/redo, save/reopen `.lab`, and export PNG: both color choices and the resulting image should survive. Try the same layer over video: the source continues moving, and color changes take effect without restarting playback.

The two new parameters, `darkColor` and `lightColor`, default to `#000000` and `#ffffff`. Missing parameters in old projects and partial runtime configurations use those same fallbacks. Shared layer opacity/blending and input transparency retain their existing behavior; changing palette does not modify the threshold field or noise pattern.

Implementation uses two color uniforms and one linear-space interpolation in the existing shader pass. It introduces no additional render target, pass, source sampling, or per-frame readback. This is not a fix or benchmark for the previously reported Rings/Cells thermal load.

## Validation

- `bun run check` and `bun run test:composition`.
- 44 new editor/runtime GPU cases cover default/explicit black-white parity, independent expected legacy threshold values, color endpoints, softness, noisy-boundary preservation, inversion, threshold extremes, opacity, transparent/partial-alpha input, missing-color reset, and matching outputs on two actual decoded video frames. Video frames are captured during playback and uploaded once as data textures for deterministic editor/runtime comparison on SwiftShader; this is not native-video performance measurement.
- Actual editor hydration, history, runtime config/frame export, old-project defaults, and saved/reopened PNG preview/export parity are checked.
- `bun tests/composition/threshold-colors-ui.mjs` against the dev server (`SHADER_LAB_URL` optional): actual image upload, both color pickers, undo/redo and downloaded `.lab` reimport. Captures: `.context/threshold-editor-ui.png`, `.context/threshold-colors.png`.

User visual acceptance remains pending. The broader Cells/halftone/color composition pass and native GPU performance work remain open.
