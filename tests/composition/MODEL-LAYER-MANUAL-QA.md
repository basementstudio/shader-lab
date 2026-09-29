# 3D Model layer — focused manual test

Scope: roadmap 4.4, step 1. A **3D Model** source layer imports a `.glb`, frames and lights it automatically, renders its glTF PBR materials or a replacement material under an HDR studio, casts soft and contact shadows, and hands its exact depth to Blur, Glass, Relief, Input → Depth and depth masks. References: 31 (depth of field on 3D forms), 15 (relief), 26–30 (glass).

## Import and framing

1. **Add layer → 3D Model** and pick a `.glb` (or drop one on the canvas). It lands centered and fills the frame, lit by the Studio, sitting on an invisible floor that only shows its shadows.
2. A `.gltf` works when its buffers and textures are embedded; one that points at separate files shows a message asking for a `.glb`. `.obj` files are not accepted.
3. **Model → Replace** swaps the file and keeps every setting.

## Moving it (Blender basics)

1. **Transform** shows Location, Rotation and Scale as X / Y / Z fields. Drag the colored axis letter to scrub (Shift slows, Alt speeds up), or click the number to type.
2. With the layer selected, the canvas shows a gizmo. **Model → Move / Rotate / Scale** switches it:
   - Move: drag the red, green or blue arrow to slide along that axis, the white center to move in the view plane.
   - Rotate: drag a colored ring to turn around that axis, the white outer ring to roll in the view, anywhere inside to rotate freely (trackball).
   - Scale: drag an axis handle to stretch that axis, the center to scale uniformly.
3. Hover the canvas and press **G**, **R** or **S** to move, rotate or scale with the mouse, no clicking needed. Press **X**, **Y** or **Z** to lock an axis (press again to unlock; **R R** rotates freely). Click or Enter applies, Esc or right click cancels.
4. **Alt + G / R / S** clears location, rotation or scale. **Middle-drag** orbits the camera; **Shift + middle-drag** slides the frame. Every drag is one undo step.
5. **Spin** turns it on a turntable with the timeline, so video exports loop cleanly when you pick 360° ÷ duration.

## Animation

1. Add a `.glb` with animation clips. The Model section shows **Animation**: Clip lists the file's clips (plus All clips and None), and the timeline length changes to the clip's.
2. Press play on the timeline: the clip plays with it. **Speed** scales it, **Repeat** loops, ping-pongs or plays once and holds the last frame, **Start** offsets it, and turning **Play** off holds the Start frame.
3. A character whose clips share one skeleton starts on its first clip; a file where each clip moves a different object plays them all.
4. The model stays in frame and on its floor for the whole clip. Blur's Depth of Field, depth masks and shadows follow the moving pose.
5. Export a video: frames match the canvas. Save and reopen: the clip settings come back.

## Materials and light

1. **Material → Original** keeps the file's PBR materials (metalness, roughness, normal maps, clearcoat, transmission, emissive). **Chrome, Brushed Metal, Glass, Clay, Rubber, Iridescent** replace every material; each sets its own Color and Roughness, which you can then change.
2. **Studio**: Studio, Softbox, Warehouse, Sunset or Neon, all normalized to the same brightness. **Model → Attach .hdr** lights it with your own file; **Remove** returns to the Studio. **Studio Rotation** moves the reflections.
3. **Key Light**, **Angle** and **Height** place a light relative to the frame (135° is top left); it casts the soft shadow. **Camera → Exposure** and **Tone Mapping** (Neutral keeps file colors closest).
4. **Shadows**: Floor on/off, Contact and Contact Blur (the darkening where it touches the floor), Cast (the key light's shadow on the floor), Softness.

## Depth for other effects

1. Put the model over a yellow background, material **Rubber**, Floor off, and add **Blur** above it (starts on Depth of Field): the nearest part stays sharp and the rest melts into grainy blur, like reference 31.
2. Add **Relief** above it with **Height From → Depth**: the model is embossed into the plate. Add **Glass**: the model blurs by its distance behind the glass.
3. Any effect with **Mask → Depth** reaches only the chosen Near/Far band of the model. Effects with **Input → Depth** (ASCII, Halftone, Pattern, Gradient Map) read the model's distance.
4. All of this keeps working when the model is inside a group.

## Persistence and export

1. Save (.lab) and reopen: settings come back; without the files the layer reports "Missing asset" or "Missing environment" and keeps its settings.
2. Duplicate, undo and redo a rotation. Export PNG and video: identical to the canvas.

Limits: Glass refracts the model itself and lets the layers below show through unbent; bending the layers below is a separate proposal. The path-traced Render mode comes later. The React runtime export does not include 3D layers yet.
