---
"@basementstudio/shader-lab": minor
---

Pattern layers can use your own motifs: set `preset: "custom"` and list up to ten images or SVGs in `patternAssets`, ordered from the lightest tones to the darkest. Each motif takes an equal band of tones, and Invert reverses the order. The new `colorMode: "original"` keeps each motif's own colors; the other color modes use the motif's alpha as its shape.
