# V3 visual references

The original sixteen images and the additional designer-feedback references below are the user's visual direction for Shader Lab V3. Before choosing shader behavior, geometry, defaults, or appearance, **open the relevant reference images**. Compare the resulting render with them. Technical correctness alone does not establish visual completion.

## Where to find them

- Original folder: `/Users/tobiasmoccagatta/Desktop/Shader Lab V3 - Referencias/`
- Workspace backup: `.context/v3-references/` (all sixteen originals copied September 17, 2026; gitignored).
- Overview for orientation: `.context/v3-reference-sheet.png` (gitignored). Open individual originals to inspect detail.

The images are visual references, not application assets. They are not bundled into the product or committed here. In another workspace, use the original folder or copy it into that workspace's `.context/v3-references/`. If neither location exists, request the images instead of guessing from their names.

## Reference index

| Image | What to inspect |
| --- | --- |
| `01-lovedance-rojo-azul.png` | Bold geometry over red/blue photography, blurred imagery, layered type. |
| `02-collage-editorial-monocromo.png` | Fragmented monochrome photo, circular geometry, dense type and technical lines. |
| `03-rana-falso-color.png` | Selective false color, dark negative space, delicate tracking annotations. |
| `04-trama-puntos-halos.png` | Fine regular dots, luminous cross-shaped halos, optical contrast. |
| `05-recortes-celdas-color.png` | Connected color regions with stepped cellular boundaries, fine dot texture, sparse technical linework on white. |
| `06-james-blake-fotografia-difusa.png` | Washed green photography, diffuse light and grain, drifting photographic forms. |
| `07-industrial-negro-naranja.png` | Burned orange/yellow highlights, deep black, layered industrial photo and type. |
| `08-estrella-halos-color.png` | Soft multicolor contours and halos around a geometric star. |
| `09-collage-tipografia-tramas.png` | Oversized layered type, photographic fragments, print texture and vivid accents. |
| `10-retrato-azul-anotaciones.png` | Diffuse false-color portrait, washed ground, fine annotations and diagram details. |
| `11-puente-recortes-geometricos.png` | Connected stepped photographic silhouettes, thin perimeter contours, generous white negative space and pink linework. |
| `12-retrato-tonos-invertidos.png` | Partial tonal inversions, solarized photographic detail and washed contrast. |
| `13-arrastre-escaner-rojo.png` | Horizontal scanner drag, torn bands, red/black/white distortion. |
| `14-rostro-rosa-erosionado.png` | Eroded photographic reveal, fine grain, pink staining and white negative space. |
| `15-relieve-grabado-plateado.png` | Fine engraved relief, metallic tonal structure and directional edges. |
| `16-anillos-desfasados-azules.png` | Rotated/offset concentric photographic bands, electric blue/black contrast and layered type. |

## Photographic Cells: accepted prototype, unfinished visual direction

The user considers the first layer useful enough; the Gap/outline inflation has been corrected. This does **not** mean it achieves references 05 and 11.

- The bridge is one photographic subject revealed through connected, stepped regions. Its contours follow the region perimeter; it is not a brick grid with every cell individually outlined.
- The white poster combines broad flowing color regions, small stepped edge fragments, fine dots, and delicate technical marks. Large randomly selected rectangular cells alone do not reproduce that appearance.
- Approved next direction: automatic connected regions and integrated None / Perimeter / Every Cell outlines first, followed by a Paint selection mode with Reveal / Erase, Brush Size, Clear, and undo. Preserve photographic detail and share geometry/outline behavior between automatic and painted selection.
- Region Size controls the broad patches; Cell Size controls their stepped boundaries. Painting should remain useful independently of automatic selection, without implying subject detection.
- Edge Scatter and two editable halftone/color/photo studies are implemented, pending user review. The existing halftone supplies the fine dots; no separate dot controls were needed in Cells. The detailed sequence and acceptance criteria are in roadmap section 3.3.1; A+B (automatic regions and outline modes) is implemented and visually accepted by the user; Paint is implemented and visually accepted by the user; D is implemented and awaits user visual feedback.
- Use these images for side-by-side visual review before marking the cell family complete. The current smooth field produces stepped patches and perimeter contours, but does not isolate a chosen subject. Directed painting is implemented and accepted; fine dot/color curation is now demonstrated in the editable studies below, awaiting user review.

For every shader slice, note the reference filenames used, which visible qualities it achieves, and which remain follow-up work. Keep the experimental editorial, analog photographic, and acid-graphics direction visible in actual renders.

## Threshold palette

Reference 01 (Lovedance red/blue) was opened for the custom Threshold palette slice. Actual blue/pink and blue/red photo renders demonstrate strong two-color separation while retaining the existing noisy boundary and softness controls. Black/white defaults remain unchanged. This supplies a palette tool for later compositions; it does not deliver the reference’s lighting, geometric collage or typography. User visual acceptance is pending; see [the focused test](tests/composition/THRESHOLD-COLORS-MANUAL-QA.md).


## Edge Scatter and editable editorial studies

References 05 and 11 were reopened full-size. Before/after renders of existing and scattered boundaries were compared, then the color palette, dot scale and composition were refined in actual renderer exports. [Color Field and Painted Flora](public/examples/v3/README.md) are editable .lab files with committed preview PNGs. They use existing app photography and original SVG marks, never the reference images.

- Color Field demonstrates broad blue/ochre/violet/teal regions, much finer source-color dots, small edge fragments, white space, and separate type/registration marks. Existing Halftone below Cells inside the isolated group supplies the texture.
- Painted Flora demonstrates full photographic interiors, a directed stepped silhouette, a fine pink perimeter, and independent text/technical lines. Paint remains editable; Scatter changes the edge without overwriting strokes.
- One new Edge Scatter control, default 0, uses bounded seeded selection offsets in Regions/Paint. No extra pass, target, readback or source samples. Random/Paint stay fixed over dynamic sources; tonal regions still react to changing imagery. High scatter can break narrow details.
- This is reference-driven progress, not a reproduction or final V3 visual completion. The richer analog finish, fine typography (current minimum 48px), final visual acceptance, sustained native-GPU performance, and encoded video export remain open.

The user authorized this next slice while away, without waiting for manual acceptance of Threshold #162. No PRs have been merged.


## Additional designer feedback — approved planning direction

The four screenshots shared on September 17 were opened and reviewed. They supplement the original sixteen; they are reference material, not product assets. Workspace backups live in `.context/v3-references/`:

| Backup | Original attachment | What to inspect |
| --- | --- | --- |
| `17-feedback-mascaras-celdas.png` | `.context/attachments/rqFvlg/image.png` | Cell poster: local effects, masking and fine texture. |
| `18-feedback-paleta-termica.png` | `.context/attachments/Snglqt/image.png` | Thermal-style false color: tonal palette study, not evidence of depth or temperature data. |
| `19-feedback-anotaciones-tecnicas.png` | `.context/attachments/dAIoad/image.png` | Orange points, red boxes, crosshairs, labels and connections: prominent annotation/Blob Tracking direction. |
| `20-feedback-formas-lovedance.png` | `.context/attachments/aByVza/image.png` | Lovedance: colored shape layers, photographic blends, masking and type. |
| `21-puntos-conectados-retrato.png` | `.context/attachments/TB1qSd/image.png` | Portrait as a tone-colored point cloud with short neighbor links: dense dark graphs, sparse light dots on gray. Shared September 21, 2026 with the new effect ideas in roadmap 3.4. |
| `22-usuario-runner-anotaciones.jpg` | `.context/attachments/aSHVq1/image.jpg` | User result, September 22, 2026: motion-blurred runner with the Annotations target, dashed connectors, magenta Pattern grid, labels. Shared as proof the direction reads. |
| `23-usuario-radiografia-humanos.jpg` | `.context/attachments/yS7643/image.jpg` | User result: false-color X-ray hand (Gradient Map) with Blob Tracking edge dots and `HUMAN xxxx` labels plus Annotations rings. |
| `24-usuario-radiografia-ascii-profundidad.png` | `.context/attachments/ikDfpO/image.png` | User composition, September 23, 2026: X-ray hand with ASCII driven by the estimated depth map (the duplicate-layer workaround that motivated scene depth) and Blob Tracking labels. |
| `25-usuario-ojo-corte-profundidad.png` | `.context/attachments/VYbhSW/image.png` | User composition, September 23, 2026: cat-eye triptych with a thin Depth mask band (Near 0.45, Far 0.37) on a thermal Gradient Map, a depth contour slice; the origin of the contour sweep. |

The user approved simple general masks (linear/radial gradient, ellipse/circle, rectangle/square, brush), replacing the earlier postponement. No pen tool. Reuse the accepted Cells brush interaction while implementing general effect masking separately from content cutouts. Automatic selection remains later work.

Technical annotations are now a prominent artistic direction, rather than only a low-priority Blob Tracking note. Revisit screenshot 19 before choosing their behavior or appearance. Thermal-style color mapping and depth-driven coloring are separate explorations; do not infer how the cover in screenshot 18 was made.

The new low-priority Pattern proposal has no additional supplied image: its concrete brief is user-uploaded SVG/image motifs in a manually ordered light-to-dark sequence (fresh green apple → rotten apple), preserving original colors and exploring explicit SVG recoloring. Do not mistake ordering motifs for generating an animated morph between them. These are roadmap additions, not implemented features or new visual approvals of existing work.


## Reusable layer masks

References 17 (cell poster with locally masked pixelation and gradient mapping) and 20 (Lovedance shapes) were reopened before implementing roadmap 1.4. Both frame local treatments with simple geometry or painted regions, which is what the four tools supply: gradient (linear/radial), ellipse, rectangle and brush, with limit-effect and cut-content scopes, invert and feather. No pen tool. This is a compositional tool, not a reproduction of either reference; shape layers with editable colors (2.7) and the local Gradient Map (2.5.2) remain separate slices. The user accepted the masks after testing them.


## Gradient Map layer

Reference 18 (Brockhampton thermal-style cover) was reopened before building the Gradient Map effect. The Thermal preset follows its deep blue → green → yellow → red progression as a tonal palette applied to luminance; it does not infer depth or reproduce the cover's exact distribution. The ramp is fully editable, so the reference guides the default palette only. The user accepted the layer on September 22, 2026.


## Shape layers

References 01 (Lovedance red/blue) and 20 were reopened before building the Shape source layer. The poster's crisp four-blade silhouette in flat red over blue photography, with the photo showing through, is reachable with Shape → Blades plus Multiply/Screen blending over a photo; the Blades preset is an interpretation of that pinwheel, not a reproduction of the artwork. User visual acceptance is pending; see [the focused test](tests/composition/SHAPE-LAYERS-MANUAL-QA.md).


## Technical annotations, part 1 (Blob Tracking)

References 19, 03, 10 and 21 were reopened for the design discussion; 19 drove this slice. Its left image (orange dots along a silhouette, boxes with a long connector) maps to Edge Dots plus the existing connectors; its right image (red `PERSON 01XX` boxes on figures) maps to corner brackets or outlines with Prefix + ID labels. These remain decorative: no recognition is performed, and custom lists let the user fake any vocabulary. User confirmation is pending; see [the focused test](tests/composition/BLOB-TRACKING-MANUAL-QA.md). The standalone Annotations layer (rulers, target circles, metadata blocks from 03 and 10) is part 2.


## Technical annotations, part 2 (Annotations layer)

Reference 03 (frog) was reopened as the model: concentric solid and dashed rings around a reticle on one point of interest, angle and value readouts, tick rulers with a boxed counter, a `NOT FOUND` tag, corner metadata blocks, a gradient swatch, sparse dashed circles in empty space, all in one pale ink over false color. References 10 and 19 supplied the dense marginalia and the surveillance vocabulary. The layer reproduces these families procedurally with presets and editable text; the organic cracks and scanned noise of 03 are out of scope. The user shared two own compositions (22, 23) on September 22, 2026 saying the results come close to the original references; treated as visual acceptance of #170 and #172.

Depth (roadmap 6.4): references 24 and 25 are the user's own results with estimated depth maps. The user accepted parallax, in-app estimation, scene depth for effect inputs and depth masks, and keyframable masks on September 23, 2026 ("works perfectly, has a lot of potential").


## Lumen Print

References 06 (washed cyan, diffuse light, grain), 07 (crushed blacks, highlights burned to red/orange/yellow, red halos), 12 (partial inversion with bright contour rims, silver tone) and 14 (highlights eaten into paper along a ragged grainy edge, magenta stain) were opened before designing the layer; 10 informed the washed false color. Each maps to a style with its own palette and values. Renders of all six styles on the bundled flora photo were compared side by side: Burned, Sabattier and Washed read close to 07, 12 and 06; Cyanotype and Lumen read as sun prints; Eroded erodes into paper but is harsher and flatter than 14. The user tried the layer in the dev server on September 23, 2026 and called it "freaking amazing"; default tuning remains theirs.


## Signal Rot

Reference 13 was opened before designing the layer: long streaks where the scanner held a line while the paper moved, those streaks snaking sideways with uneven scan speed, torn horizontal bands and white areas where the paper lifted off the glass, all in red/black/white. Scanner Drag maps to held segments with wavy fronts, wobble, stretch, ragged tears and white dropouts from one edge; Torn Scan pushes the dropouts. The Signal Rot style adds the electronic side (row jitter, chroma drift, crushed levels) that the TouchDesigner idea described without an image. First renders exposed axis mistakes in line noise/chroma and rectangular, sawtooth drag fronts; both were corrected before review. The streak richness of 13 depends on busy source imagery; flat skies give flat streaks. The user accepted the styles on September 23, 2026 and asked to drop a fourth, Tape Wobble.


## Dot Grid

Reference 04 was reopened: one exact grid of dots covers the whole sheet, tiny uniform specks on the empty pale blue paper and large solid dots only inside the dark shapes, which fade out into smaller dots at their edges over a soft blurred halo. The user asked for a standalone layer instead of changing Halftone, because these dots are nearly perfect and grid-like while Halftone simulates print. Coordinate follows 04 with a pale blue ground, near-black ink, a raised Level so light areas stay at the minimum speck, softened tone and a blurred underlay. The first render gave medium dots in a light sky; Level corrected it. The cross-shaped orange flares are not part of this layer. User visual acceptance is pending.
