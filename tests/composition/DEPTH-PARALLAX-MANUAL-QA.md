# Depth map and parallax — focused manual test

Scope: roadmap 6.4, stage 1. An Image layer accepts a second grayscale image as its depth map. With it attached, the layer gains a **Depth** group: the camera can orbit, sway, nod or dolly over the photo, near content moves more than far content, and nearer content covers what is behind it. **Estimate** generates the depth map in the browser; you can also attach your own, framed like the photo, with white for near by default.

## Estimating

1. Add a photo (Image layer). In the properties panel, **Source → Depth map → Estimate**. The first run downloads the model (about 100 MB on WebGPU, 27 MB on the WASM fallback) and shows progress; later runs use the browser cache. Inference takes a few seconds on a real GPU.
2. The result attaches as `<photo name>-depth.png`, Invert Depth is off, and **Show Depth** lets you judge it. **Estimate again** replaces it.
3. SVG sources cannot be estimated; attach a map instead.

## Attaching

1. Alternatively, **Source → Depth map → Attach** and pick a grayscale depth image with the same framing.
2. The file name shows next to the label, **Replace** and **Remove** appear, and the **Depth** group unfolds below the placement controls.
3. **Show Depth** previews the depth instead of the photo. If near objects look dark, turn on **Invert Depth**.
4. Save (.lab) and reopen: the depth map comes back with the photo. Reopening without the depth file reports "Missing depth map" on the layer and keeps the photo.

## Camera

1. **Motion → Orbit** with the default Amount: the photo breathes in a slow circle; near subjects sweep more than the background. **Sway** is horizontal, **Nod** vertical, **Dolly** pushes in and out. **Off** freezes the camera.
2. **Depth Range** widens or flattens the separation between planes. **Focus Plane** picks which depth stays still: 0 anchors the background, 1 anchors the nearest subject.
3. **Camera Offset** is a static shift; keyframe it on the timeline for your own move and turn Motion off.
4. **Edges → Transparent** leaves the frame empty where the camera looks past the photo; **Stretch** repeats the border. **Quality** trades steps for speed; Low is fine for small moves.

## Depth as an engine for other effects

1. With a depth map on the photo, add **ASCII** (or Halftone, Pattern, Gradient Map) above it and set **Input → Depth**. The effect now reads distance instead of brightness, drawn over the photo. No duplicate layer needed.
2. Add any effect above the photo and set **Mask → Shape → Depth**. **Near** and **Far** pick the band of depth the effect reaches; **Feather** softens the band; **Invert** flips it.
3. Both keep working when the photo and the effect sit inside a group, and when the photo is inside a group and the effect above it. Remove the depth map: Input falls back to luminance and the mask stops masking.
4. **Contour sweep.** Set a thin band (Near 0.95, Far 0.9), open the timeline panel and press the keyframe rhombus next to Near. Move to the end, set Near 0.05 and Far 0, keyframe again. Play: the slice travels through the subject. Near and Far are separate tracks so they can move at different speeds. Every mask control has the same button; the tracks read **Mask Near**, **Mask Far**, **Mask Feather** and, for geometric shapes, **Mask Center**, **Mask Size**, **Mask Rotation**.

## Expected limits

- Where a near subject uncovers what was behind it, the pass stretches the subject's edge pixels into the gap, as DepthFlow does without inpainting. Soft depth edges hide this; hard-edged depth maps show it as a short smear on the trailing side.
- The depth map is sampled with the photo's UVs; it is not realigned or rescaled to match.
- Video layers do not accept a depth map yet. Estimation is a single still-image pass, never per frame.
- Scene depth follows the nearest depth-bearing Image layer below. Transform effects between the two do not warp the depth with the image.

## Export and runtime

1. Export PNG and video: the parallax matches the canvas at the exported time.
2. The runtime package renders the same march; a shader export lists the depth map as a second asset placeholder to replace.
