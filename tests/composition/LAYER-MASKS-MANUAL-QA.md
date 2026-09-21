# Layer masks — focused manual test

Scope: roadmap 1.4. **Cut content** is available only for effects inside a group, because transparency can only reveal layers outside that group; at the root the control is disabled with an explanation. Four tools only: linear/radial gradient, ellipse, rectangle and brush. No pen tool. Masks are per layer (groups included) and separate from the older **Mode → Mask** option, which is unchanged.

## Limit an effect

1. Add a photo, then a Halftone above it. Select Halftone.
2. In **Mask**, choose **Ellipse**. The halftone should appear only inside the ellipse; the photo outside stays untouched.
3. Drag the center handle to move it, the X handle to rotate and widen, the Y handle to change height. Each drag is one Undo step.
4. Increase **Feather**; the edge softens without darkening.
5. Toggle **Invert**, then **Enabled** off and on.

## Cut content

1. Group the photo and Halftone (Cmd+G). Select the group.
2. Choose **Rectangle**. Outside the rectangle the background (or layers below the group) shows through. A text layer above the group must not change.
3. On the Halftone inside the group, switch **Applies to** to **Cut content**: outside its mask the whole group content becomes transparent, revealing what is outside the group.

## Gradients

1. On any layer choose **Linear gradient**; drag the start/end handles. Start is fully applied, end is fully removed.
2. **Radial gradient**: full at the center, fading to the edge; resize with the handles.

## Brush

1. Choose **Brush**. Editing starts automatically (crosshair cursor). Paint with Reveal, switch to Erase, adjust Brush Size, use **Clear Mask**.
2. Each stroke is one Undo step. Esc or **Done** exits. Space-drag pans while editing.
3. Play a video below the mask: the painted mask stays fixed while the video moves.

## Persistence and export

1. Save (.lab), reload/import: masks, handles positions and painted strokes return exactly.
2. Duplicate a masked layer; edit the copy's mask: the original is unaffected.
3. Export PNG and video: identical to the canvas. The runtime package renders the same masks.

Limits: masks follow the viewport like Cells paint (stable artboard remains roadmap 2.8). Brush edges are bilinear, not feathered. Masks are not animatable yet.
