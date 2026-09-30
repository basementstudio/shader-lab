# Connected Dots Edge Snap — focused manual test

Scope: roadmap 6.6 #4, "Connected Dots: ajustar los puntos a los bordes de la imagen". Reference: 21.

## Basics

1. Put Connected Dots above a portrait or a photo with clear silhouettes. **Edge Snap** sits under Jitter and starts at 0; the layer looks exactly as before.
2. Drag Edge Snap to 1. Points in cells crossed by an edge move onto it, on its darker side, so outlines (jaw, eyes, nose, hair against the background) read as rows of dots and links, like the contours in 21. Points in flat areas stay where Jitter put them. Values between 0 and 1 move them part of the way.
3. Thin dark lines (eyelids, lips, a drawn contour) pull the dots onto the line itself, so the line keeps its dark tone instead of vanishing between two rows.
4. With **Invert** on, the light side of an edge takes the dots.
5. Over a cutout (text or a transparent image), points snap to the cutout edge and stay on the opaque side.

## Modes and styles

- Try Graph, Blobs, Plexus and Mesh. In Mesh, triangle corners land on edges, so facets follow the silhouettes instead of cutting across them.
- **Style**: two new styles use Edge Snap. **Contour Graph** is Portrait Graph with snapping and a few more midtone links, so faces read by their contours. **Facets** is a low-poly mesh in the image's colors whose triangles follow the forms. Every older style keeps Edge Snap at 0; changing Edge Snap on any of them shows Custom.

## Video and performance

Play a video (for example the default aura clip) with Contour Graph. Flat, grainy areas must not shimmer more than with Edge Snap at 0; dots on moving edges travel with the edges. Edge Snap alone does not make the layer render continuously.

## Persistence and export

Save and reopen, duplicate, undo an Edge Snap change and export PNG and video: identical to the canvas. Projects saved before Edge Snap existed open at 0.

Limits: a point only moves inside its own cell, so each cell adds at most one point to a contour, and details finer than a quarter of the spacing can be missed.
