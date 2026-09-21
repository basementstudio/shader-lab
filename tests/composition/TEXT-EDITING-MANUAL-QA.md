# Direct text editing — focused manual test

Scope: roadmap 2.2 and 2.3. Text layers are edited in place on the canvas and gain multiline, alignment, line height, rotation and sizes below 48px. Older text scenes render exactly as before.

## In place

1. Add a Text layer (or open a scene with one). Double-click anywhere on the canvas: the selected text becomes editable in place, in its own font, size and position. If no text layer is selected, the topmost editable text layer is picked.
2. Type. Enter inserts a new line; Cmd+Enter or clicking away commits; Esc restores the previous text. The whole edit is one Undo step.
3. The Properties panel has an **Edit text** button and the Text field is now a multiline box.

## Handles

1. With a text layer selected and not editing, a dashed box marks the text. Drag the center handle to move it (Offset updates), the X handle to rotate, the Y handle to change Font Size. One drag is one Undo step; Esc cancels a drag.
2. Anchor still works: change it in the panel and the handles follow the new anchor point.

## Typography

1. Font Size goes down to 8. Set 12 and write a two-line caption; it should stay legible in exports at document size.
2. **Align**: Follow anchor keeps the old behavior; Left, Center, Right align ragged lines explicitly.
3. **Line Height** spaces the lines. **Rotation** turns the block around its anchor point.
4. Top and bottom anchors keep the first or last line flush with the edge as before.

## Persistence and compatibility

1. Save (.lab), reload: text, newlines, rotation, align and size return exactly. Export PNG/video and the runtime package match the canvas.
2. Open the demo and the older text fixtures: single-line text with the default settings is pixel-identical to before.

Limits: text is rasterized to a canvas texture as before, so extreme rotation of very large text may clip at the canvas edge. Wrapping is manual (Enter), not automatic. At very small sizes the three handles overlap; use the panel sliders or zoom in.
