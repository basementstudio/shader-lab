---
"@basementstudio/shader-lab": patch
---

Fix CRT layer opacity fading to black instead of becoming transparent.

`CrtPass.render` re-implemented the base `PassNode.render` body but never
assigned `this.inputNode.value`, so the opacity blend mixed toward an empty
placeholder texture (black) rather than the upstream composite. It now calls
`super.render(...)` before capturing history, which also fixes `multiply` /
`darken` blend modes and `mask` composite mode at full opacity.
