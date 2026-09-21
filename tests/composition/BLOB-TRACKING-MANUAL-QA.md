# Blob Tracking upgrade — focused manual test

Scope: roadmap 6.3, part 1. Blob Tracking gains corner brackets, edge dots and decorative label modes. Existing scenes render exactly as before: new layers and old files default to Outline, coordinate labels and no dots.

## Frame

1. Add a photo or video, then **Blob Tracking**. In Decorations set **Frame** to **Corner brackets**: each blob shows four L-shaped corners; **Bracket Length** grows or shrinks them. **None** hides the frame but keeps the center marker, labels and dots.
2. Trails still follow the frame in Outline and Brackets.

## Edge dots

1. **Edge Dots** above 0 scatters dots along each blob's silhouette, as in the orange-dot reference. 1 is dense, 0.25 sparse. **Dot Size** scales them. The dots redraw each frame from the detection, so they shimmer on video like the reference.

## Labels

1. **Label Text → Prefix + ID** with prefix PERSON gives labels like `PERSON 47K2`. The code is assigned by **Label Seed** per tracked blob and stays fixed while the blob lives. Change the seed to reshuffle.
2. **Custom list**: one line per label. Each blob keeps its pick. Lowercase is drawn uppercase; the atlas covers letters, digits and basic punctuation.
3. **Coordinates** is the old behavior. All labels are decorative: nothing is recognized, and the panel says so.

## Compatibility and video

1. Open an older scene with Blob Tracking: outline, labels and stroke unchanged. A saved layer with Outline off now shows Frame: None.
2. Save and reload: frame, label mode, prefix, list and dots return. Export PNG/video and the runtime package match.
3. On video, IDs and labels should not flicker between frames; compare a persistent-tracking clip with and without the new decorations. SwiftShader numbers are in `.context/blob-video-performance.json`; native timing is still open (7.2).

Limits: dots come from the 64×36 analysis grid, so they sit on a coarse silhouette. Per-element colors and a standalone Annotations layer are part 2.
