# Gradient Map keyframes — focused manual test

Scope: roadmap 2.5.2, "paradas animables". The whole ramp of a Gradient Map layer is one timeline property, **Ramp**. Amount and Invert were already animatable and are unchanged.

## Keying the ramp

1. Add a photo and a **Gradient Map** above it. Open the timeline (caret on the right of the transport bar) and pause.
2. A diamond appears next to **Dark to light** in the Ramp section. Click it at 0 s: a **Ramp** lane appears in the timeline with one keyframe.
3. Move the playhead to the end. With **Auto-Key** on, pick another preset or drag a stop: a second keyframe is created at the playhead. The layer's base ramp does not change while a track exists.
4. Scrub between the keyframes: the photo blends between the two ramps and the Preset menu reads Custom. Play: the blend is smooth, with no jump at either keyframe.
5. Turn **Auto-Key** off and edit the ramp between the keyframes: the sidebar previews the edit but the canvas keeps the animated ramp. Click the diamond to commit it as a keyframe. Moving the playhead discards an uncommitted preview, as for other animated properties.

## Interpolation

1. Same number of stops (for example Thermal, then Thermal with one stop dragged): the stops glide from one position to the other.
2. Different number of stops (Thermal to Duotone, Neon to Thermal): the ramps crossfade and nothing pops at either keyframe.
3. Select a keyframe and change its easing in the curve editor: Step holds the first ramp until the next keyframe; Linear and the bezier presets shape the blend.
4. Disable the Ramp lane (eye in the timeline list): the layer returns to its base ramp.

## Persistence and export

1. Undo and redo keyframe creation and edits.
2. Duplicate the layer: the copy has its own Ramp track; editing it leaves the original alone.
3. Save (.lab), reopen: the keyframes, their ramps and easings return exactly.
4. Export PNG at several times and a short video: they match the canvas at the same times. Export the shader and play it with the React runtime: same blend.
5. Open an older project with Gradient Map layers and no tracks: it looks exactly the same as before.

Limits: colors blend in sRGB, the same space the ramp uses between its stops, so a crossfade between complementary colors passes through a duller middle. Easing overshoot past a keyframe is clipped to the keyframe ramp. Lumen Print and Connected Dots palettes stay unanimated.
