# V3 visual references

These sixteen images are the user's visual direction for Shader Lab V3. Before choosing shader behavior, geometry, defaults, or appearance, **open the relevant reference images**. Compare the resulting render with them. Technical correctness alone does not establish visual completion.

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
- Evaluate Edge Scatter later. Try existing halftone and color layers for the fine dot treatment before adding more controls. The detailed sequence and acceptance criteria are in roadmap section 3.3.1; A+B (automatic regions and outline modes) is implemented and visually accepted by the user; Paint is implemented in the next stacked slice and awaits user visual acceptance; the later refinements remain planned.
- Use these images for side-by-side visual review before marking the cell family complete. The current smooth field produces stepped patches and perimeter contours, but does not isolate a chosen subject. Directed painting is available for review; curation of the fine dot/color treatment remains a follow-up.

For every shader slice, note the reference filenames used, which visible qualities it achieves, and which remain follow-up work. Keep the experimental editorial, analog photographic, and acid-graphics direction visible in actual renders.
