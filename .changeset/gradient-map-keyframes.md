---
"@basementstudio/shader-lab": minor
---

Gradient Map ramps can be animated. Timeline tracks with the new `gradient` value type blend between two ramps: stops glide when both ramps have the same number of stops, and when the counts differ the shorter ramp gains stops that leave its look unchanged, so the in-between frames stay a smooth crossfade. Each keyframe keeps its easing. Scenes without ramp tracks render exactly as before.
