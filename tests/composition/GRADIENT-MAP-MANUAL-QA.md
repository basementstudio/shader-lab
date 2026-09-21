# Gradient Map — focused manual test

Scope: roadmap 2.5.2. A reorderable effect layer that recolors by tone with an editable ramp. The global Scene → Color Map is unchanged. The Gradient *layer* paints a color field; Gradient *Map* recolors what is below it.

## Basics

1. Add a photo, then **Gradient Map** from the effects list (Core, after Threshold). The photo takes the Thermal ramp: dark tones navy/blue, mid tones green, highlights yellow/red.
2. **Preset**: switch between Thermal, Duotone, Sepia, Neon, Grayscale. Editing the ramp turns the preset into Custom.
3. **Ramp**: drag a stop, click the bar to add one (max 5), select a stop to change its color, double-click to remove. Each edit is undoable.
4. **Amount** at 0 restores the original colors; 0.5 blends. **Invert** maps dark tones to the right end of the ramp.

## Scope by group and mask

1. Group the photo and the Gradient Map. Add a colored layer outside the group: it must not change.
2. On the Gradient Map choose Mask → **Brush** and paint over part of the photo. Only the painted region is recolored; the rest keeps its original colors. Ellipse/rectangle masks behave the same.
3. Add a Halftone above the Gradient Map inside the group: the dots take the mapped colors.

## Persistence and export

1. Save (.lab), reload: preset/custom stops, Amount and Invert return exactly.
2. Duplicate the layer, edit the copy's ramp: the original is unaffected.
3. Export PNG and video: identical to the canvas. The runtime package renders the same mapping. Play a video below it: the mapping follows the moving tones.

Limits: ramp stops are not animatable; Amount and Invert are. The default preset values are open to your choice.
