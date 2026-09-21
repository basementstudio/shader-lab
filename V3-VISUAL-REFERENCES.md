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

The user approved simple general masks (linear/radial gradient, ellipse/circle, rectangle/square, brush), replacing the earlier postponement. No pen tool. Reuse the accepted Cells brush interaction while implementing general effect masking separately from content cutouts. Automatic selection remains later work.

Technical annotations are now a prominent artistic direction, rather than only a low-priority Blob Tracking note. Revisit screenshot 19 before choosing their behavior or appearance. Thermal-style color mapping and depth-driven coloring are separate explorations; do not infer how the cover in screenshot 18 was made.

The new low-priority Pattern proposal has no additional supplied image: its concrete brief is user-uploaded SVG/image motifs in a manually ordered light-to-dark sequence (fresh green apple → rotten apple), preserving original colors and exploring explicit SVG recoloring. Do not mistake ordering motifs for generating an animated morph between them. These are roadmap additions, not implemented features or new visual approvals of existing work.


## Reusable layer masks

References 17 (cell poster with locally masked pixelation and gradient mapping) and 20 (Lovedance shapes) were reopened before implementing roadmap 1.4. Both frame local treatments with simple geometry or painted regions, which is what the four tools supply: gradient (linear/radial), ellipse, rectangle and brush, with limit-effect and cut-content scopes, invert and feather. No pen tool. This is a compositional tool, not a reproduction of either reference; shape layers with editable colors (2.7) and the local Gradient Map (2.5.2) remain separate slices. User visual acceptance is pending; see [the focused test](tests/composition/LAYER-MASKS-MANUAL-QA.md).
