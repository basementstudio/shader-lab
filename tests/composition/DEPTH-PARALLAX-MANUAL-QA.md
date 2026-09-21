# Depth map and parallax — focused manual test

Scope: roadmap 6.4, stage 1. An Image layer accepts a second grayscale image as its depth map. With it attached, the layer gains a **Depth** group: the camera can orbit, sway, nod or dolly over the photo, near content moves more than far content, and nearer content covers what is behind it. Nothing is generated: you bring the depth map, framed like the photo, with white for near by default.

## Attaching

1. Add a photo (Image layer). In the properties panel, **Source → Depth map → Attach** and pick a grayscale depth image with the same framing.
2. The file name shows next to the label, **Replace** and **Remove** appear, and the **Depth** group unfolds below the placement controls.
3. **Show Depth** previews the depth instead of the photo. If near objects look dark, turn on **Invert Depth**.
4. Save (.lab) and reopen: the depth map comes back with the photo. Reopening without the depth file reports "Missing depth map" on the layer and keeps the photo.

## Camera

1. **Motion → Orbit** with the default Amount: the photo breathes in a slow circle; near subjects sweep more than the background. **Sway** is horizontal, **Nod** vertical, **Dolly** pushes in and out. **Off** freezes the camera.
2. **Depth Range** widens or flattens the separation between planes. **Focus Plane** picks which depth stays still: 0 anchors the background, 1 anchors the nearest subject.
3. **Camera Offset** is a static shift; keyframe it on the timeline for your own move and turn Motion off.
4. **Edges → Transparent** leaves the frame empty where the camera looks past the photo; **Stretch** repeats the border. **Quality** trades steps for speed; Low is fine for small moves.

## Expected limits

- Where a near subject uncovers what was behind it, the pass stretches the subject's edge pixels into the gap, as DepthFlow does without inpainting. Soft depth edges hide this; hard-edged depth maps show it as a short smear on the trailing side.
- The depth map is sampled with the photo's UVs; it is not realigned or rescaled to match.
- Video layers do not accept a depth map yet, and there is no depth generation.

## Export and runtime

1. Export PNG and video: the parallax matches the canvas at the exported time.
2. The runtime package renders the same march; a shader export lists the depth map as a second asset placeholder to replace.
