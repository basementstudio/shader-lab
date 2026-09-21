# Shader Lab V3 — Hoja de trabajo priorizada

V3 debe facilitar resultados artísticamente atractivos desde la primera inserción y conservar libertad para transformarlos hasta volverlos irreconocibles. Los nuevos efectos serán protagonistas; los actuales seguirán disponibles y combinables. Crear piezas tipográficas con facilidad también es una prioridad práctica. Cada incorporación debe respetar las composiciones guardadas.

El orden es una **propuesta de ejecución**; las prioridades de producto son revisables. La composición fiable es una dependencia para integrar texto, efectos y 3D. Las fases 1–7 definen el recorrido de V3, con validación propia y cierre global obligatorio. La fase 8 es opcional y no condiciona ese cierre. No se afirman implementaciones, fechas ni rendimiento ilimitado.

## Flujo de integración y entrega

Todo el trabajo de V3 se entrega mediante PRs pequeños apilados. Cada nuevo PR parte de la rama del PR anterior y la usa como base. El primer PR de la pila apunta a la rama de integración de V3; un PR principal reúne esa rama y tiene como destino `main`.

**PR nuevo → PR anterior → rama de integración de V3 → PR principal → `main`.**

Los PRs pequeños pueden integrarse progresivamente en la rama de V3. Ningún cambio de V3 se integra en `main` hasta completar el alcance obligatorio del plan y su validación global de la fase 7. La fase 8 sigue siendo opcional y no bloquea esa entrega.

La rama de integración es `git-chad/shader-lab-v3-plan`. La pila comienza con [#151](https://github.com/basementstudio/shader-lab/pull/151), en `git-chad/v3-composition-alpha`, seguido de [#152](https://github.com/basementstudio/shader-lab/pull/152), en `git-chad/v3-transparent-media-bounds`. La base compartida de composición alfa continúa desde esta última rama. Al integrar PRs, actualizar las bases de los descendientes para conservar la pila; únicamente el PR principal apunta a `main` y permanece en borrador hasta completar la validación obligatoria.

PR principal: [#150 — V3: designer-focused composition and experimental graphics](https://github.com/basementstudio/shader-lab/pull/150).

Primer paso de la fase 1: [baselines de composición y mapa del canal alfa](tests/composition/README.md). Esta cobertura inicial no cierra la fase ni sustituye la validación visual con las dieciséis referencias elegidas.

Avance de 1.3: grupos aislados con hasta ocho niveles, controles del editor, reordenamiento de subárboles, plegado, visibilidad, opacidad, duplicación, deshacer, persistencia v7 y exportación de configuración. Las pruebas cubren estado, hidratación real y píxeles guardados/reabiertos. El usuario confirmó la prueba de aislamiento de foto + halftone, opacidad y plegado. La corrección posterior de arrastre permite entrar/salir de grupos con indicadores de destino y actualiza orden y pertenencia en una sola operación; la [lista manual ampliada](tests/composition/GROUPS-MANUAL-QA.md) sigue disponible para la validación global.

**Prioridades revisadas con el usuario (17 de septiembre de 2026):** texto transparente por defecto (2.1) implementado en #156 y confirmado por el usuario. Anillos desplazados implementados y validados visualmente; el usuario también confirmó la corrección de arrastre entre grupos. Regiones conectadas y contornos de perímetro en Photographic Cells (3.3.1 A+B) confirmados visualmente por el usuario; pintura manual confirmada visualmente por el usuario, con entrada automática a edición al elegir Paint. El usuario reporta alta carga/calor al combinar efectos: evaluar rendimiento durante reproducción y edición de escenas dinámicas en cada entrega. La decisión inicial de posponer máscaras generales queda reemplazada por la aprobación posterior de 1.4: gradiente, elipse, rectángulo y pincel, con prioridad alta y sin herramienta de pluma. Mantener los modos creativos propios de cada efecto. Las anotaciones técnicas y la revisión de Blob Tracking ganan protagonismo en 6.3; Patterns personalizables queda como exploración de prioridad baja en 6.5.

### Ampliaciones confirmadas tras feedback de diseñadores

**Aprobadas como dirección del plan; el estado de cada entrega se detalla abajo.** Orden de trabajo acordado: inicio limpio → máscaras reutilizables y Gradient Map local → herramientas de composición con formas y texto → anotaciones técnicas → investigación de profundidad/parallax. Patterns personalizables se registra con prioridad baja. Este orden revisa prioridades entre fases sin eliminar dependencias ni validaciones; no obliga a terminar toda una fase antes de abordar la siguiente entrega útil.

| Tema | Alcance acordado | Ubicación |
| --- | --- | --- |
| Inicio limpio | Proyecto vacío con ajustes neutros; demo separada y ajustes globales visibles | 1.0 |
| Máscaras generales | Gradiente lineal/radial, elipse/círculo, rectángulo/cuadrado y pincel; sin pluma | 1.4 |
| Gradient Map local | Capa de efecto, combinable con grupos y máscaras; conservar ajuste global | 2.5.2 |
| Formas | Capas editables y presets; recorte y mezclas fotográficas | 2.7 |
| Texto y composición | Edición directa, etiquetas pequeñas, multilínea, alineación y artboard estable; conexión con grilla opcional | 2.2–2.3, 2.8 y fase 8 |
| Anotaciones técnicas | Puntos, cajas, cruces, etiquetas y líneas; dirección artística destacada, vinculada a Blob Tracking | 6.3 |
| Profundidad y parallax | Investigar mapas importados primero; generación automática después | 6.4 |
| Patterns personalizables | Cargar SVG/imágenes, ordenar una secuencia tonal y elegir tratamiento del color; prioridad baja | 6.5 |

Las nuevas capturas de referencia están identificadas en [V3-VISUAL-REFERENCES.md](V3-VISUAL-REFERENCES.md). La aprobación de estas ideas no implica aceptación visual de las entregas que aún esperan prueba del usuario.

## Fase 1 — Resolver la base de composición y proteger proyectos existentes

**Prioridad máxima:** transparencia y grupos sostienen la composición. Resolver primero el inicio limpio y ampliar esa base con máscaras generales simples, sin perder los modos de cobertura propios de cada efecto. La preparación inicial debe ser breve y servir a la ejecución.

### Referencias visuales obligatorias

Antes de decidir el comportamiento o la apariencia de cualquier shader, abrir las imágenes pertinentes de [V3-VISUAL-REFERENCES.md](V3-VISUAL-REFERENCES.md). El directorio original y la copia local contienen las dieciséis referencias del usuario. Comparar renders con esas imágenes; las pruebas técnicas no sustituyen la revisión visual ni dan por terminada una familia.

### 1.0 Ofrecer un inicio realmente limpio — primera corrección

El usuario reporta que una sesión nueva conserva ajustes globales de la escena demo, alterando su trabajo sin una indicación clara. La inspección confirma que `Start fresh` aplica `getDefaultProjectFile()`, incluidos sus ajustes globales; distinguir ese comportamiento de restaurar un proyecto guardado.

Ofrecer **New blank project** con escena vacía y ajustes globales neutros, manteniendo la demo como elección separada. Hacer evidente cuándo hay ajustes globales activos y permitir restablecerlos. Definir claramente el recorrido de primera visita, nuevo proyecto y restauración de sesión; no borrar ni neutralizar los ajustes deliberados de archivos existentes.

**Implementado, pendiente de aceptación manual:** primera visita vacía; menú Project con New blank project / Open demo también en Actions móvil; aviso de gradación global y reset completo reversible que conserva fondo, composición y calidad de preview. Crear/abrir un documento reinicia el historial, incluidas entradas pendientes. Autosave admite proyectos vacíos y los persiste inmediatamente al comenzar uno, evitando restaurar una demo antigua por encima de un vacío nuevo; los proyectos importados/restaurados mantienen su gradación. [Prueba manual](tests/composition/CLEAN-PROJECTS-MANUAL-QA.md).

**Cierre:** una foto insertada en un proyecto vacío no hereda gradación de la demo. Abrir la demo y restaurar un proyecto conservan sus respectivos ajustes. Verificar también historial, autosave y guardado/reapertura del nuevo proyecto.

### 1.1 Preparar pruebas y referencias mínimas

Reunir las dieciséis imágenes elegidas y pruebas con fotografías, retratos, objetos, tipografía y video, variando luz y detalle. Guardar escenas existentes y resultados de referencia para comprobar su apariencia desde el primer cambio.

### 1.2 Comprobar el estado actual y corregir el canal alfa

Revisar la transparencia durante composición y efectos. Una inspección previa limitada en otro checkout detectó opacidad forzada, rellenos negros y procesamiento compartido; orienta esta comprobación, sin reproducir todos los problemas.

Permitir regiones vacías junto a contenido totalmente opaco. Bajar la opacidad global no sustituye la transparencia por píxel. Los efectos deben conservarla o transformarla con sentido y ofrecer fondos transparentes cuando generen fondos y corresponda. Esto no incluye eliminar automáticamente el fondo de fotografías arbitrarias.

### 1.3 Introducir grupos reales con alcance propio

Los grupos con alcance propio son **requisitos confirmados**, pedidos explícitamente por un colega diseñador. Las máscaras de grupo también están confirmadas: tras una postergación inicial, el usuario aprobó retomar máscaras generales simples en 1.4, junto a los modos creativos propios de los efectos. Se propone composición aislada por defecto: procesar los contenidos pertinentes del grupo y luego integrarlo al conjunto. Sus efectos no deben afectar capas externas. Agregar carpetas sobre una cadena global de filtros no resuelve el requisito.

Incluir organización, reordenamiento, plegado, visibilidad, opacidad, deshacer y guardado. Definir la profundidad de anidamiento durante la implementación, sin prometer reproducir todo Photoshop.

**Ampliación acordada para más adelante — Pass Through:** añadir un modo opcional de grupo que permita a sus efectos procesar las capas inferiores externas, dentro del contexto de composición de su padre. Mantener **Isolated** como valor predeterminado, también para proyectos guardados que no indiquen un modo. Esta ampliación no bloquea las entregas en curso.

Ofrecer una elección explícita entre Isolated y Pass Through, con una explicación breve de su alcance. Un grupo con Ink y Displaced Rings sobre una imagen externa debe dejarla intacta en Isolated y procesarla al elegir Pass Through. Las capas superiores y las que estén fuera de un ancestro aislado deben conservar su independencia. Definir el comportamiento de opacidad, mezcla y recorte del grupo antes de implementarlo; no asumir que basta con aplanar sus hijos.

Validar grupos anidados y cambios de modo, visibilidad, reordenamiento, deshacer/rehacer, guardado/reapertura y paridad entre editor, runtime y exportación. Conservar la apariencia de todos los grupos aislados existentes.

### 1.4 Máscaras generales simples y modos creativos por efecto — prioridad alta

**Decisión actual confirmada:** retomar máscaras generales reutilizables. Reemplaza la postergación anterior. Mantener únicamente cuatro herramientas: **gradiente** (lineal y radial), **elipse** (incluye círculo), **rectángulo** (incluye cuadrado) y **pincel**. **Sin pen tool/pluma ni edición de nodos Bézier.** La selección automática de sujetos o regiones queda para una extensión posterior, no para esta primera entrega.

Distinguir dos usos mediante controles claros:

- **Aplicar un efecto dentro de una máscara:** por ejemplo, pintar Halftone sobre parte de una fotografía; fuera de la máscara sigue visible la imagen sin ese efecto.
- **Recortar contenido de una capa o grupo:** fuera de la máscara hay transparencia que revela las capas inferiores.

Definir asignación y alcance, inversión, desactivación y edición directa de posición/tamaño/dirección según la herramienta. Mantener pocos controles; evaluar suavidad de borde y transiciones del gradiente según el resultado. Reutilizar la interacción y el código útil del pincel de Cells —Reveal/Erase, tamaño, edición explícita y un trazo por acción de historial— sin asumir que ya funciona como máscara general. Conservar las pinturas guardadas y los modos específicos de Cells y Rings; evitar acoplar la nueva máscara a su geometría.

```text
Texto — fuera del grupo
Grupo «Retrato» — máscara de elipse que recorta contenido
  Halftone — máscara de pincel que limita el efecto
  Fotografía
Fondo — fuera del grupo
```

En esta composición, el pincel limita Halftone sin borrar la foto; la elipse recorta el grupo entero. Texto y fondo quedan fuera de ambos alcances. La selección de una capa de formas como máscara se conecta con 2.7; la asignación arbitraria de cualquier silueta de capa requiere una decisión posterior.

**Cierre:** gradiente, elipse, rectángulo y pincel funcionan con los dos usos definidos, inversión/desactivación, zoom y desplazamiento. Bordes suaves sin halos negros ni pérdida incorrecta de alfa; grupos aislados y máscaras anteriores conservan su apariencia. Probar historial, duplicación, hidratación real, guardado/reapertura y paridad editor/runtime/PNG/video. Las máscaras estáticas se reutilizan mientras cambia la fuente de video; la pintura manual no implica seguimiento automático del sujeto.

**Implementado, pendiente de aceptación visual del usuario:** cada capa (grupos incluidos) tiene una máscara opcional con forma None / Linear gradient / Radial gradient / Ellipse / Rectangle / Brush, alcance **Limit effect** / **Cut content** (solo efectos; en fuentes y grupos ambos equivalen a recortar la propia capa), Invert, Enabled, centro, tamaño, rotación y Feather (elipse y rectángulo). Manijas directas en el lienzo: centro, eje X (rotación y ancho), eje Y (alto); el gradiente lineal usa inicio/fin. El pincel reutiliza la interacción de Cells (Reveal/Erase, Brush Size, Clear, un trazo por acción de historial, entrada automática al elegir Brush) con el mismo códice compacto, sin acoplarse a la geometría de Cells. Coordenadas centradas en unidades del lado corto, iguales a Paint; la máscara sigue el viewport hasta resolver el artboard estable (2.8). Interpolación premultiplicada sin halos negros; el modo antiguo **Mode → Mask** no cambia. Editor y runtime comparten `renderer/layer-mask.ts`; mover una máscara solo actualiza uniforms. Persistencia .lab, duplicado, historial, export PNG/video, runtime y MCP `update_layer.mask`. Referencias revisadas: 17 y 20. [Prueba manual](tests/composition/LAYER-MASKS-MANUAL-QA.md). Pendiente: máscaras animables por timeline y selección de una capa de formas como máscara (2.7).

### 1.5 Anticipar las decisiones de viabilidad 3D

Probar brevemente formatos, materiales, animaciones, conservación de recursos y geometría SVG. Registrar decisiones abiertas para las fases 4 y 5 sin demorar la composición. Una entrada de catálogo o tipo de capa no demuestra soporte completo de modelos.

**Cierre de la base:** huecos transparentes y contenido opaco conviven; grupos y efectos mantienen su alcance al reordenar, deshacer, guardar, reabrir y exportar. Las escenas anteriores conservan su apariencia y los bordes suaves quedan limpios. Las máscaras generales acordadas y cada modo creativo incorporado deben superar esas mismas pruebas; la selección automática y una herramienta de pluma no forman parte del alcance inicial.

## Fase 2 — Facilitar las piezas tipográficas y pulir las capas actuales

**Prioridad temprana:** resolver la inserción y edición de texto aporta valor directo al diseño, junto con mejores efectos iniciales. Priorizar cambios útiles y acotados. Las pruebas pueden avanzar durante la fase 1; la integración depende de su tratamiento de transparencia, sin duplicarlo.

### 2.1 Insertar texto sobre fondo transparente

El usuario reporta texto blanco sobre negro y la necesidad de recurrir a máscaras, Screen o cambiar manualmente el fondo. El requisito es insertar texto visible, con contenido opaco y color editable sobre fondo transparente, sin esos rodeos. Mantener el fondo sólido como una opción deliberada y conservar el uso de texto como máscara cuando se elija expresamente.

La inspección inicial confirmó que `layers.ts` creaba texto en modo máscara y `layer-registry.ts` definía fondo negro con alfa 1. `text-pass.ts` ya distingue el alfa del fondo y dibuja el texto opaco; admite color editable y posición mediante anclaje y desplazamiento. La corrección debe cambiar los valores de capas nuevas y conservar el fondo sólido de archivos anteriores que omitan ese parámetro.

### 2.2 Componer texto directamente en el lienzo

**Dirección aprobada:** seleccionar, arrastrar y redimensionar texto directamente, con controles de alineación y sincronización con posición, anclaje y zoom. Validar deshacer/rehacer y posición guardada. Resolver primero un conjunto útil dentro del editor actual; una sección separada de **Design** sigue como alternativa de producto para evaluar más adelante, no como segunda interfaz comprometida.

La grilla de la fase 8 se conecta con esta edición y con las formas de 2.7: sirve de referencia para márgenes, columnas y alineaciones. El snapping debe poder desactivarse y conservar colocación libre. La edición directa y la alineación básica deben seguir siendo útiles sin activar una grilla; su carácter opcional no cambia por esta conexión.

### 2.3 Ampliar controles tipográficos útiles

Conservar fuente, tamaño, peso, espaciado, color, anclaje y desplazamiento. Incorporar etiquetas más pequeñas y texto multilínea; revisar el límite de 32 caracteres y el mínimo de 48px, que impiden anotaciones finas en los estudios actuales. Definir límites útiles al implementar, sin prometer un motor tipográfico completo. Mantener claro el control de fondo transparente/sólido y comprobar composición, edición y exportación con bloques de texto.

### 2.4 Ajustar halftone como primer efecto

Ajustar parámetros sobre el material de prueba hasta lograr resultados útiles con luces y detalles diversos. Introducir pequeñas mejoras algorítmicas solo si las pruebas lo justifican; no plantear una reescritura general.

### 2.5 Extender el criterio y facilitar la edición

Extender el criterio a los demás efectos. Organizar controles con etiquetas comprensibles, entradas numéricas, deslizadores apropiados y restablecimiento. Aplicarlo también a capas nuevas: valores curados como puntos de partida editables hasta la abstracción extrema.

#### 2.5.1 Colores editables en Threshold

**Implementado, pendiente de validación visual del usuario:** dos colores editables en la capa **Threshold** existente: **Color oscuro** y **Color claro**, reemplazando la salida fija negro/blanco por una combinación personalizada. Mantener negro y blanco como valores iniciales y como fallback en proyectos anteriores.

Conservar el funcionamiento del umbral, la inversión y la transparencia; cambiar la paleta solo modifica los colores de salida. Integrar los selectores con deshacer/rehacer, guardado/reapertura y exportación editor/runtime. Evitar un pase de render adicional para esta recoloración, teniendo en cuenta fuentes de video y escenas dinámicas.

**Cierre:** con los colores iniciales, las escenas existentes se ven iguales; al elegir, por ejemplo, azul y rosa, ambas regiones adoptan esos colores sin desplazar sus límites. La paleta elegida sobrevive al historial, reapertura y exportación.

Entrega: controles Dark Color / Light Color, fallbacks negro/blanco y mezcla dentro del pase existente, sin render adicional. Referencia 01 revisada y render azul/rosa inspeccionado. Pruebas de GPU editor/runtime, video decodificado, hidratación real, historial, guardado/reapertura y PNG; [prueba enfocada y límites](tests/composition/THRESHOLD-COLORS-MANUAL-QA.md).

#### 2.5.2 Gradient Map como capa de efecto — prioridad alta

**Aprobado:** trasladar la capacidad de mapeo tonal global a una capa de efecto reordenable, con colores/puntos del gradiente editables y alcance controlado por grupos y máscaras. Conservar también el ajuste global y la apariencia de proyectos existentes. Distinguir esta recoloración de la capa Gradient, que genera un campo de color.

Ejemplo de aceptación: Gradient Map recolorea únicamente la foto de su grupo; al enmascararlo con pincel, el resto de la foto conserva sus colores originales y las capas externas no cambian. Probar opacidad, inversión del mapeo si se ofrece, historial, persistencia y exportación con fotografía/video.

Explorar una paleta de apariencia térmica a partir de la referencia Brockhampton compartida. El falso color tonal puede funcionar sin profundidad; colorear un depth map es otra interpretación. No afirmar que un mapa de profundidad mide temperatura ni que reproduce automáticamente la distribución de color de esa portada.

**Implementado, pendiente de aceptación visual del usuario:** nueva capa de efecto **Gradient Map** (catálogo Core, tras Threshold) con rampa editable (2–5 paradas, GradientRamp compartido con el ajuste global), presets Thermal / Duotone / Sepia / Neon / Grayscale (los valores iniciales quedan a cargo del usuario), Amount e Invert. Mapea la luminancia Rec.709 con una LUT lineal de 256 muestras compartida con el Color Map global (`renderer/color-map-lut.ts`), preserva la cobertura de entrada y respeta grupos y máscaras; el ajuste global y los proyectos existentes no cambian. Editor/runtime, persistencia, duplicado, historial, export y MCP por parámetros normales. Referencia 18 revisada: paleta de apariencia térmica sin inferir profundidad. [Prueba manual](tests/composition/GRADIENT-MAP-MANUAL-QA.md). Pendiente: paradas animables.

### 2.6 Preservar las composiciones guardadas

Aplicar los nuevos valores únicamente a capas recién creadas y comparar proyectos anteriores con sus resultados de referencia, incluidos textos con fondo sólido, máscaras y modos de mezcla elegidos previamente.

### 2.7 Capas de formas y composiciones fotográficas

**Aprobado por etapas:** formas editables y una pequeña biblioteca de presets, con color, posición, tamaño y rotación. Reutilizar la interacción de composición y las máscaras simples de 1.4. Permitir utilizar formas para enmascarar y para combinar fotografía/color, tomando Lovedance como referencia visual.

Probar doble exposición con las máscaras y modos de mezcla disponibles antes de añadir un efecto específico. Mantener el alcance simple: no incorporar pluma, edición Bézier ni un Illustrator completo. Dibujar geometría vectorial libre queda fuera de esta entrega; el pincel acordado pinta cobertura de máscara, no crea trazados vectoriales.

**Implementado (primera etapa), pendiente de aceptación visual del usuario:** capa fuente **Shape** (fila de fuentes del selector) con siete presets procedurales —Ellipse, Rectangle (Corner Radius), Triangle, Polygon (Sides), Star (Points, Inner Radius), Ring (Thickness) y Blades (Blades, Twist, Blade Width, Hub, guiño a Lovedance)—, Color, Outline (solo borde) y Softness (antialias a 0). Center/Size/Rotation en unidades de composición (las mismas que las máscaras), editables con las manijas del lienzo compartidas con las máscaras (`geometry-handles.tsx`): un arrastre = un paso de historial, Esc cancela. SDFs en un solo shader (cambiar de forma no recompila), cobertura como alfa recto para que los modos de mezcla sobre fotografía funcionen (doble exposición con Multiply/Screen/Color). Editor y runtime idénticos; persistencia, duplicado, export y máscaras por capa. Referencias 01 y 20 revisadas: silueta plana sobre fotografía azul; la curva de Blades es una interpretación, no una reproducción. [Prueba manual](tests/composition/SHAPE-LAYERS-MANUAL-QA.md). Pendiente: usar una capa Shape como máscara de otra capa. **Solicitado por el usuario al aceptar la primera etapa (21 de septiembre de 2026):** formas a partir de SVG subidos por el usuario, con color editable donde el archivo lo permita; convive con los presets procedurales y con la carga de SVG como imagen que ya existe. Decidir rasterización (como la capa Image) frente a distancia firmada para bordes nítidos, softness y outline; mantener fuera la edición de nodos.

### 2.8 Artboard estable y relación con la grilla

Definir un área de composición de tamaño estable para conservar encuadre y posiciones de texto, formas y efectos al cambiar el tamaño de la ventana. Los estudios actuales se reencuadran porque el canvas sigue el viewport; separar tamaño del documento, zoom y vista previa. Preservar las escenas anteriores que dependen del comportamiento adaptable y comprobar correspondencia con exportación.

La grilla opcional de la fase 8 debe utilizar el mismo espacio del documento para alinear texto y formas. Esta base se desarrolla dentro del editor existente antes de decidir si una sección Design separada aporta valor.

**Implementado, pendiente de aceptación del usuario:** `compositionAspect` distingue **Screen (adaptive)** —comportamiento anterior, conservado por las escenas antiguas y la demo— de los artboards fijos (presets y Custom), cuyo tamaño real es la `composition` guardada y se edita en Scene → Composition → Size. El canvas del editor se ajusta y centra en el viewport con pasteboard; los pases reciben el documento como `logicalSize`, así preview, máscaras, Paint, texto y export coinciden. Cambiar de preset recorta el documento actual al nuevo ratio; las escenas antiguas con preset no-screen pasan de un marco guía a un artboard real (su export adopta ese tamaño). Los proyectos nuevos empiezan en 16:9 1920×1080; los estudios de `public/examples/v3` ahora son artboards Custom 720×960. El visor de la comunidad aplica letterbox a los artboards fijos. Zoom 100% = ajuste al viewport. [Prueba manual](tests/composition/ARTBOARD-MANUAL-QA.md). Pendiente: grilla opcional (fase 8) y render a resolución de zoom.

**Cierre:** el texto nuevo se integra sobre fondo transparente sin activar máscaras ni Screen; su contenido permanece opaco y su color es editable. La edición directa coincide con controles, deshacer y posición guardada; las formas y el artboard mantienen una composición consistente. Los efectos actuales ofrecen valores iniciales útiles, conservan libertad de edición y combinación, y las escenas anteriores —incluidos sus textos— mantienen su apariencia. Resolver estos puntos no depende de la grilla opcional.

## Fase 3 — Explorar la primera tanda artística e incorporarla al catálogo

**Prioridad revisada:** anillos y celdas ya fueron seleccionados con el usuario. Revelado alterado sigue como familia candidata; su alcance debe confirmarse antes de incorporarla.

### 3.1 Traducir las referencias en criterios visuales

Explorar deterioro fotográfico, imágenes sintéticas o escultóricas y geometría, inspirados en afiches experimentales, discos, revistas de música electrónica, Photoshop y diseño de finales de los noventa y los dos mil. Admitir registros claros, oscuros, sobrios y coloridos.

La base principal son las dieciséis imágenes elegidas, más Lovedance —forma roja sobre fotografía azul, atravesada por luces— y el collage monocromo de foto difusa, curvas técnicas y tipografía precisas. Transformar fotografía con geometría, tono, textura y composición sin limitarse al cyberpunk o una estética retro. Los archivos iniciales fueron exploratorios: solo dos ejemplos interesaron y una página de Paradiso falló.

### 3.2 Probar las tres familias recomendadas

| Familia candidata | Resultado y referencias |
| --- | --- |
| Anillos desplazados y rotados | Bandas circulares transformables; afiche fotográfico azul y negro con círculos concéntricos desalineados (`16-anillos-desfasados-azules.png`). Incluir en la exploración semidiscos de diferentes tamaños y desplazamientos, con huecos transparentes como modo propio del efecto. |
| Recortes por celdas o bloques | Revelar bloques con detalle fotográfico interior y contornos opcionales. El puente presenta siluetas escalonadas, no grandes píxeles planos; el afiche blanco combina regiones de color, bordes celulares y puntos finos. |
| Revelado fotográfico alterado | Inversiones tonales parciales, expansión de luces y sombras, neblina y erosión; James Blake verde, retrato azul difuso con anotaciones y retrato gris de apariencia solarizada. |

Los nombres describen resultados; no establecen las técnicas originales de producción.

### 3.3 Validar libertad y combinaciones

Exigir el caso de **48 anillos**, aunque la referencia muestre seis u ocho. Explorar centro, radios, anchos, distribución, rotaciones individuales o progresivas, traslación, escala, separaciones, superposición e irregularidad. Evitar límites estéticos arbitrarios y evaluar los límites técnicos reales.

Permitir destruir completamente el reconocimiento de la imagen. Preparar combinaciones editables, como anillos + dos tintas + erosión, usando componentes disponibles y ampliándolas al incorporar familias posteriores.

Separar la transformación de la fotografía dentro de cada banda del modo que recorta su cobertura. Probar anillos completos y semidiscos, con desplazamiento y rotación, y definir controles útiles para revelar/ocultar regiones. Los huecos deben mostrar el contenido inferior y los efectos deben respetar los límites del grupo. Este trabajo amplía la exploración de anillos existente; no agrega otra familia ni exige implementar primero máscaras geométricas genéricas.

**Primer prototipo implementado y validado visualmente por el usuario (valores iniciales a cargo del usuario):** Displaced Rings admite 1–128 bandas (48 comprobadas), anillos/semidiscos, centro, radio, distribución, desplazamiento alternado/progresivo/aleatorio con semilla, rotación global y por banda, escala progresiva, separación y bordes suaves. Output distingue Distort y Cutout; dentro de un grupo, Cutout revela las capas externas por los huecos. Editor y runtime comparten el comportamiento, con pruebas de píxeles, hidratación real, deshacer, guardado/reapertura y PNG. El catálogo incorpora una vista previa fotográfica y muestra el efecto primero. Ver [alcance y prueba manual](tests/composition/DISPLACED-RINGS-MANUAL-QA.md).

Esto no cierra la fase 3: quedan la curaduría visual con las referencias completas, combinaciones con otros efectos, rendimiento con fotografías/video a resoluciones representativas y la selección de las otras familias. El prototipo usa transformaciones progresivas; no incluye controles individuales por anillo ni inversión de cobertura.

**Valores iniciales de anillos elegidos por el usuario:** las capas nuevas usan 22 semidiscos, radio 2, rotación por anillo de 45°, desplazamiento y separación 0, con Output en Distort. Mantener los parámetros de escenas existentes y los valores anteriores cuando falten campos en archivos guardados.

**Primer prototipo de celdas aceptado como base útil por el usuario; corregido el exceso de grosor de contornos al cambiar Gap:** Photographic Cells selecciona bloques rectangulares según zonas claras, oscuras o azar con semilla. Conserva el detalle fotográfico interior y permite ajustar tamaño, proporción, irregularidad de filas, separación, bordes suaves, inversión y contornos. Cutout revela las capas externas al grupo; Keep Image conserva la fotografía y superpone únicamente los contornos seleccionados. Incluye catálogo, editor/runtime, guardado/reapertura y PNG. Ver [alcance y prueba manual](tests/composition/PHOTOGRAPHIC-CELLS-MANUAL-QA.md). No cierra la familia: el usuario señala que todavía no alcanza las referencias. Quedan regiones fotográficas conectadas con siluetas escalonadas y contornos de perímetro (puente, `11-puente-recortes-geometricos.png`), regiones amplias de color con bordes celulares y puntos finos (afiche blanco, `05-recortes-celdas-color.png`), curaduría con las imágenes abiertas y validación temporal/de rendimiento con video. La entrega A+B detallada abajo añade regiones conectadas y contornos sin divisiones internas; el usuario confirmó su utilidad visual con una composición propia de águila, anillos, recortes y trama de puntos. Combinar capas para color/tramas cuando resulte más simple. La selección dirigida mediante Paint ya está implementada y aceptada; el tratamiento editorial completo sigue pendiente.

#### 3.3.1 Evolucionar Photographic Cells hacia regiones y revelado dirigido

**Dirección acordada con el usuario; A+B+C implementados y confirmados visualmente por el usuario.** La capa incorpora regiones automáticas, contornos de perímetro y pintura manual como otra fuente de selección, útil aunque el modo automático funcione bien. Mantener pocos controles y reutilizar la geometría, transparencia y composición existentes.

**Objetivo visual:** abrir y comparar `11-puente-recortes-geometricos.png` y `05-recortes-celdas-color.png` antes de decidir apariencia o valores iniciales. En el puente, conservar fotografía reconocible dentro de una silueta conectada con escalones y un contorno fino de color. En el afiche blanco, formar regiones amplias de color con bordes celulares, pequeños fragmentos alrededor y una trama mucho más fina que las celdas.

**Estado de A+B:** Regions utiliza un campo espacial coherente con semilla o tonos interpolados de la imagen; Region Size controla los parches y Cell Size los escalones. Outline ofrece None / Perimeter / Every Cell, con contornos alrededor de huecos y sin aristas internas a Gap 0, incluidas filas irregulares. Los valores iniciales nuevos favorecen regiones conectadas; hidratación y runtime conservan la apariencia de configuraciones anteriores. Se revisaron renders fotográficos sobre blanco y una combinación exploratoria con halftone. Paint ya está aceptado; Edge Scatter y estudios editables del afiche están implementados y pendientes de feedback visual, como se detalla en C y D. Ver [prueba manual, cobertura y límites de rendimiento](tests/composition/PHOTOGRAPHIC-CELLS-MANUAL-QA.md).

**A. Regiones automáticas — primera entrega**

- Añadir un modo **Regions** que seleccione conjuntos de celdas vecinas y produzca parches continuos. Explorar selección guiada por la imagen y patrones espaciales coherentes con semilla; conservar los modos actuales de selección por celda.
- Separar **Region Size**, que determina la escala de los parches, de **Cell Size**, que determina el tamaño de los escalones del borde. Mantener detalle fotográfico completo dentro de cada región.
- Reutilizar Threshold, inversión y Seed cuando sean pertinentes; mostrar solo los controles relevantes al modo elegido. A Gap 0, las celdas seleccionadas contiguas deben formar una superficie continua.
- Separar internamente la selección de regiones de la generación de celdas y contornos. Tanto la selección automática como la pintura posterior deben alimentar el mismo resultado geométrico.
- Evaluar los resultados con varias fotografías y regiones de color. La selección tonal o procedural no promete identificar sujetos: aislar exactamente el puente requiere una selección dirigida o trabajo posterior de detección. Si el automático no resulta útil, documentar el límite y priorizar pintura sin bloquear toda la mejora.

**B. Contornos integrados en Photographic Cells — junto con regiones**

- Mantener el contorno dentro de este efecto: necesita conocer la selección y la vecindad de sus celdas. Un efecto genérico para delinear imágenes, texto o grupos queda como posibilidad futura fuera de esta entrega.
- Controles: **Outline → None / Perimeter / Every Cell**, **Width** y **Color**. Perimeter sigue la silueta revelada; Every Cell conserva la apariencia actual de contornos por celda.
- En Perimeter, eliminar aristas compartidas entre celdas seleccionadas cuando formen una región continua. Delinear también los límites de huecos reales dentro de la región. Comprobar uniones, esquinas y filas irregulares sin costuras internas.
- Definir y comprobar el comportamiento con Gap positivo sobre la cobertura resultante: las separaciones reales pueden crear contornos, sin inflar el grosor. Conservar la corrección reciente de antialiasing, el alfa de la fuente y el comportamiento de Cutout / Keep Image.
- Aplicar los mismos modos de contorno a regiones automáticas y pintadas. Mantener la apariencia de proyectos anteriores: al faltar el nuevo selector, un contorno existente conserva Every Cell y un ancho cero sigue sin dibujar contorno.

**C. Pintura manual — implementada y confirmada visualmente por el usuario**

Implementación: Layout Paint entra automáticamente a edición; Done permite salir y Edit Paint retomarla. Reveal/Erase, Brush Size, Clear reversible, Edit/Done, guía tenue temporal y un trazo por acción de historial. Cobertura compacta persistida en parámetros y runtime, textura GPU reutilizada sin reconstruirla por cambios del video. Mantiene el espacio de la grilla al hacer zoom, desplazar o redimensionar; cambiar Cell Size no borra la pintura. Referencia revisada: 11 (puente). [Prueba y límites](tests/composition/CELL-PAINT-MANUAL-QA.md). No cerrar D ni asumir seguimiento del sujeto.

- Añadir **Paint** como modo de selección de la capa. El usuario pinta dónde quiere revelar la fotografía; la geometría convierte esa área en bloques escalonados. Cambiar Cell Size ajusta la fidelidad al trazo sin borrar lo pintado.
- Interfaz mínima: **Reveal / Erase**, **Brush Size** y **Clear**, con una acción explícita para entrar y salir de pintura. Mostrar la huella del pincel y evitar conflictos con selección, desplazamiento y zoom del lienzo.
- Mantener la pintura alineada en coordenadas de composición al cambiar zoom, tamaño de vista o resolución de exportación. La pintura representa cobertura de esta capa; no incorpora seguimiento automático del sujeto en video.
- Un trazo debe poder deshacerse/rehacerse como una sola acción; Clear también debe ser reversible. Conservar lo pintado al cambiar temporalmente de modo y definir su persistencia en duplicación, guardado/reapertura e hidratación real del editor.
- Incluir la selección pintada en el archivo de proyecto y en la configuración/recursos exportados al runtime. Vista previa, PNG y render de video deben reproducirla sin depender del estado temporal del editor.
- Esta herramienta es un modo de revelado propio de Photographic Cells. No reactiva el trabajo pospuesto de máscaras geométricas genéricas ni exige la revisión de Blob Tracking.

**D. Refinamientos visuales — implementados, pendientes de feedback visual del usuario**

Se abrieron las referencias 05 y 11 y se compararon renders reales. Se incorporó **Edge Scatter** (0–1, inicial 0) para Regions y Paint: fragmenta el perímetro mediante un desplazamiento acotado del punto de selección, sin mover la geometría ni el detalle de la fotografía. Reutiliza Seed; no modifica la pintura guardada. Cero conserva el resultado anterior, y Individual Cells lo ignora. Sin pases, texturas ni muestras de fuente adicionales; no depende del tiempo. Detalles pintados muy estrechos pueden fragmentarse con valores altos.

[Dos estudios editables](public/examples/v3/README.md) muestran campos de color con trama fina y revelado fotográfico dirigido, con tipografía y marcas SVG separadas. Cells se aplica después del Halftone existente dentro del grupo: los puntos son mucho más pequeños que las celdas y respetan su cobertura. No hizo falta añadir más controles de trama a Cells. Las referencias no se incluyen como assets; se utiliza fotografía existente de la app y linework original.

La curaduría demuestra esas cualidades, no cierra toda la dirección artística ni reproduce los afiches. Sigue pendiente la aceptación del usuario, el acabado analógico más rico y la validación nativa de rendimiento/exportación temporal de 7.2. El mínimo tipográfico actual de 48px limita anotaciones finas; retomar el ajuste acotado de 2.3. La curaduría también confirma que el canvas sigue el viewport: las escenas importadas se reencuadran según la ventana. El artboard estable aprobado en 2.8 debe resolverse antes de presentar estas escenas como plantillas de afiches fijos. [Prueba manual, compatibilidad y límites](tests/composition/CELL-SCATTER-MANUAL-QA.md).

**Criterios de exploración utilizados:**

- **Edge Scatter:** probar un único control que fragmente celdas cerca del perímetro, preservando las regiones principales. Comparar con los pequeños cuadrados alrededor de las manchas del afiche blanco antes de decidir su incorporación.
- **Puntos finos:** probar primero una composición con la capa de halftone existente, manteniendo una escala de trama menor que Cell Size. Evaluar el orden y el alcance del grupo para que la trama respete la región revelada. Añadir controles propios solo si esa combinación no alcanza un resultado útil.
- Color, anotaciones técnicas y tipografía pueden venir de otras capas. Preparar composiciones editables que demuestren el conjunto sin recargar este efecto.

**Orden y aceptación:** entregar A+B primero en un PR apilado; revisar renders y obtener feedback del usuario. Continuar con C en una entrega posterior; evaluar D con esas herramientas disponibles. No considerar implementada ninguna mejora por haberla documentado. Mantener todos los PR dentro de la pila V3 hasta completar el plan.

**Criterios de cierre de esta mejora:**

- Una región de varias celdas a Gap 0 muestra fotografía continua, contorno exterior fino y ausencia de divisiones internas en Perimeter; Every Cell reproduce las divisiones deliberadamente. Comprobar regiones separadas, huecos y filas irregulares.
- Region Size cambia la escala de los parches y Cell Size cambia los escalones sin convertir el interior en colores planos. Comparar capturas con las referencias 05 y 11, incluyendo una composición sobre blanco con amplio espacio vacío.
- En Paint, poder revelar un detalle elegido, borrar parte, cambiar Cell Size y zoom, deshacer/rehacer, guardar/reabrir y exportar conservando el área elegida y sus contornos.
- Mantener aislamiento de grupos, transparencia de la fuente, ancho de contorno estable al variar Gap, compatibilidad de proyectos anteriores y equivalencia editor/runtime. Ampliar pruebas de GPU, hidratación mediante `applyLabProjectFile`, historial y exportación según cada entrega.
- Medir respuesta interactiva con fotografía y video a resoluciones representativas; comprobar estabilidad temporal de regiones automáticas. Documentar límites junto a las capturas revisadas. Pasar `bun run check` y `bun run test:composition` al implementar; la revisión visual del usuario sigue siendo necesaria.

**Idea para ampliar anillos, todavía por elegir:** probar una única familia de formas concéntricas (círculo, triángulo y cuadrado) reutilizando conteo, rotación, desplazamiento y separación. Separar la forma base del corte completo/mitad permitiría extender los semidiscos sin multiplicar controles. No implementar esta ampliación en el prototipo de celdas; presentar la propuesta al usuario primero.

### 3.4 Reorganizar el catálogo junto con cada incorporación

Dar protagonismo a los nuevos efectos y menor prominencia a los actuales, manteniéndolos accesibles. «Legacy» es una denominación informal, no una deprecación. El nombre público está abierto; **Essentials** fue una sugerencia no confirmada. Acompañar cada alta posterior con esta organización.

**Cierre:** las familias seleccionadas ofrecen una inserción visualmente intencional, controles amplios y combinaciones personalizables; superan pruebas de extremos, transparencia y grupos. La selección definitiva queda explícita antes de integrarlas.

## Fase 4 — Completar el recorrido de modelos 3D

**Dependencia:** requiere la fase 1. Su posición frente a otras ampliaciones artísticas es revisable.

### 4.1 Definir compatibilidad e importar modelos

Definir formatos, materiales y animaciones admitidos y objetivos de rendimiento mediante las pruebas tempranas. Importar modelos con materiales, texturas y recursos necesarios, sin prometer compatibilidad universal.

### 4.2 Ofrecer una capa 3D útil desde el inicio

Dar encuadre e iluminación automáticos útiles y controles de posición, rotación, escala, cámara, luces y composición. Combinarla con imagen, video y texto; aplicar efectos gráficos a su imagen renderizada respetando transparencia, grupos y máscaras.

### 4.3 Integrar animación y persistencia

Permitir seleccionar clips, reproducir, pausar, ajustar velocidad y repetición. Vincularlos al tiempo de composición y completar importar, editar, guardar, reabrir y exportar.

**Cierre:** materiales, texturas y animaciones compatibles sobreviven al recorrido completo; vista previa y exportación coinciden temporalmente y el modelo respeta el alcance de grupos y máscaras.

## Fase 5 — Convertir SVG en volumen editable

**Dependencia:** reutiliza el recorrido de capas 3D de la fase 4.

### 5.1 Definir el subconjunto SVG compatible

Precisar soporte de trazos, huecos, trazados compuestos y casos excluidos a partir de pruebas con logotipos.

### 5.2 Generar y editar el volumen

Derivar geometría de los contornos y ofrecer profundidad de extrusión, bisel, material, orientación e iluminación. El resultado funciona como una capa 3D normal; no implica reconstrucción arbitraria de modelos complejos mediante IA.

**Cierre:** los SVG admitidos generan capas utilizables que se editan, guardan, reabren y exportan; compatibilidad y exclusiones quedan claras.

## Fase 6 — Ampliar las familias artísticas seleccionadas

**Prioridad propuesta y revisable:** comenzar por tono y textura para enriquecer combinaciones. Este orden no es una dependencia técnica ni una aprobación de las cinco familias.

### 6.1 Evaluar las candidatas restantes en este orden propuesto

| Orden | Familia | Resultado y referencias |
| --- | --- | --- |
| 1 | Falso color y mapeo tonal quemado | Recoloración selectiva y pérdida de detalle; rana oscura con amarillo, naranja y azul, y fotografía industrial negra y naranja. |
| 2 | Tramas, grano y erosión | Puntos, desintegración y vacíos; afiche celeste punteado, collage cromático denso y rostro u ojos rosados que desaparecen en una página casi vacía. |
| 3 | Halos de color | Bandas difusas alrededor de figuras o texto; estrella con zonas azules, amarillas y rojas. |
| 4 | Arrastre de escáner | Estiramiento, compresión y desplazamiento irregular de bandas; afiche rojo distorsionado. |
| 5 | Relieve grabado | Volumen superficial aparente mediante luces y sombras; composición gris y plateada. |

### 6.2 Integrar la selección y ampliar combinaciones

Elegir según resultados visuales y viabilidad, aplicar los criterios de controles y valores iniciales, actualizar el catálogo en cada incorporación y ampliar las combinaciones editables.

### 6.3 Anotaciones técnicas y calidad de Blob Tracking — dirección artística destacada

**Prioridad revisada:** el usuario quiere profundizar en estos detalles; deja de ser una nota de prioridad baja. Los puntos naranjas, cajas rojas, cruces, etiquetas y líneas de las nuevas referencias aportan una dirección visual importante para V3. Desarrollarla después de las herramientas de composición prioritarias, por entregas con revisión visual.

Revisar primero lo que ya ofrece Blob Tracking: detección, estabilidad temporal, contornos, valores iniciales, controles y coste con fotografía/video. Decidir qué conviene ampliar allí y qué merece una capa de anotaciones independiente, sin duplicar funciones ni asumir una reescritura.

Explorar colocación guiada por bordes/regiones y colocación decorativa con semilla. Buscar combinaciones de puntos, cajas, cruces, etiquetas y conexiones con control coherente de densidad, escala y color, evitando una lista inmanejable de parámetros. Las etiquetas decorativas deben distinguirse de una detección real: una caja con texto no demuestra reconocimiento de personas ni seguimiento semántico. Revisar renders con las referencias abiertas, tanto en composiciones sutiles como densas.

En video, evitar parpadeo y saltos de identificadores/posiciones cuando sea viable; medir estabilidad y carga sostenida antes de prometer seguimiento. Conservar la apariencia de escenas anteriores, historial, persistencia y paridad de exportación. Los modos de máscara derivados de detección siguen como extensión posterior a las cuatro máscaras manuales de 1.4; distinguir visualización, efecto localizado y recorte de cobertura.

### 6.4 Profundidad y parallax — investigación aprobada

Investigar primero **imagen + depth map importado** para movimiento sutil de cámara/parallax, desplazamiento y aplicación selectiva de efectos según distancia. Parallax es un resultado que puede usar profundidad; no requiere prometer otra clase de mapa al usuario. Definir alineación, inversión/escala de profundidad y tratamiento de bordes/huecos antes de elegir controles o incorporar el efecto.

Usar [DepthFlow](https://github.com/BrokenSource/DepthFlow) como referencia técnica para la exploración, sin asumir que se integra directamente en el navegador. Revisar arquitectura, dependencias y condiciones de reutilización antes de elegir una integración. Comparar una prueba pequeña con los objetivos de rendimiento de Shader Lab.

La generación automática de profundidad viene después: evaluar ejecución local o servicio, coste, latencia y reutilización del resultado. Comenzar con fotografía; profundidad de video, estabilidad entre frames y relación con futuras escenas 3D requieren validación separada. No ejecutar inferencia por frame por defecto ni asumir compatibilidad solo porque una biblioteca la ofrezca. La investigación debe producir una decisión de viabilidad y alcance; no constituye una promesa de entregar todas estas variantes en V3.

### 6.5 Mejorar Pattern con patrones propios — prioridad baja

**Exploración solicitada:** ampliar la capa Pattern existente para cargar SVG o imágenes propias y organizar una secuencia de motivos. Permitir previsualizar y reordenar los elementos que se asignan de zonas claras a oscuras. El orden manual debe expresar una intención visual, sin depender de ordenar automáticamente por el brillo de los archivos.

Ejemplo del usuario: una secuencia desde una manzana verde/fresca hasta una podrida, asignada por orden a tonos claros → oscuros. Cambiar el orden cambia qué motivo aparece en cada rango tonal de la imagen; no significa interpolar o transformar una manzana en otra.

Permitir conservar los colores originales de las imágenes y SVG multicolor. Explorar un modo explícito de recoloración para SVG compatibles, definiendo si reemplaza un color, usa una tinta o permite editar una paleta; no destruir los colores originales por defecto ni prometer recolorear cualquier SVG arbitrario. Definir formatos/subconjunto SVG, transparencia, escala, separación, cantidad de motivos y comportamiento de los rangos al ampliar la herramienta.

Conservar patrones incorporados y proyectos anteriores. Los motivos cargados, su orden y sus colores deben sobrevivir a duplicación, historial, guardado/reapertura y exportación editor/runtime. Validar con fotografía y video, reutilizando texturas/atlas sin decodificar archivos por frame; medir memoria y fijar límites útiles al implementar. Esta exploración de prioridad baja no bloquea las entregas prioritarias; su incorporación final a V3 queda por decidir.

**Cierre:** las familias seleccionadas pasan sus pruebas visuales, de libertad y composición; las candidatas pospuestas quedan identificadas sin presentarlas como entregas prometidas. Registrar el resultado de anotaciones/Blob Tracking y la decisión de viabilidad de profundidad/parallax. Identificar explícitamente qué alcance de Patterns se incorpora o se aplaza.

## Fase 7 — Verificar el conjunto y cerrar V3

**Posición por dependencia:** requiere las entregas anteriores; no permite omitir su validación ni postergarla hasta aquí.

### 7.1 Revisar regresiones y usabilidad de extremo a extremo

Recorrer inserción, edición extrema, combinaciones, catálogo, grupos, máscaras, deshacer y reapertura. Incluir inicio limpio, máscaras de efecto frente a recorte, Gradient Map local, formas, piezas tipográficas y concordancia de edición directa con controles, artboard y exportación. Comparar escenas antiguas y comprobar que valores iniciales atractivos y libertad creativa coexisten.

### 7.2 Verificar rendimiento y exportación

**Requisito transversal confirmado por el usuario (17 de septiembre):** el editor debe mantener una interacción y reproducción útiles en escenas dinámicas con video, efectos animados y, al incorporarse, elementos 3D. El usuario reportó alta carga/calor con los nuevos efectos; aún no se atribuyó el coste a una capa concreta. Optimizar escenas estáticas o evitar renders en pausa es solo una parte del trabajo.

**Base inicial:** benchmark acotado con video decodificado, Rings/Cells por separado y combinados, disponible en `tests/composition/effect-video-performance.mjs`. SwiftShader identifica Rings como el coste mayor en ese entorno; no sustituye medir la GPU nativa ni demuestra que el calor del usuario esté resuelto. Paint reutiliza su textura y verifica que las fuentes dinámicas siguen actualizándose.

- Medir Rings y Cells por separado y combinados con video en reproducción, más la pila completa; extender los mismos casos a modelos/animación 3D cuando estén disponibles. Registrar GPU/navegador, resolución real, escala de píxeles, parámetros y número de capas. Los tiempos de SwiftShader no sustituyen la validación en hardware real.
- Evaluar tiempos de frame sostenidos, variaciones/picos, respuesta al editar controles y uso de memoria bajo movimiento continuo. Conservar un caso visual representativo del trabajo del usuario para comparar optimizaciones; una captura PNG no permite reconstruir sus parámetros ni diagnosticar por sí sola el origen de la carga.
- Priorizar menos trabajo y muestreos repetidos por píxel, reutilización de recursos y ausencia de lecturas GPU→CPU innecesarias por frame. Cualquier caché debe invalidarse correctamente al cambiar el video, la animación, los parámetros, la cámara/escena 3D o la resolución.
- Mantener fidelidad visual, transparencia, orden de composición y sincronización temporal. Si se necesita una calidad de previsualización ajustable, distinguirla claramente de la calidad de exportación y verificar ambas rutas. Incorporar mediciones comparables a cada ampliación artística, sin esperar al cierre de V3.

Probar casos representativos con capas, video y 3D. Comparar vista previa y exportación, incluidos tiempos de animación, alcance de efectos y recursos conservados. Comprobar transparencia en formatos que la admitan y documentar límites observados de rendimiento y compatibilidad.

**Cierre:** verificar los criterios del alcance seleccionado en las fases 1–7, resolver problemas que impidan cumplirlos y distinguir funciones entregadas de exploraciones futuras. La grilla de la fase 8 no es condición para cerrar V3.

## Fase 8 — Explorar una grilla de composición, opcional

**Nice to have, prioridad baja:** el usuario propone una guía de composición conceptualmente similar a la de Figma. Puede posponerse íntegramente sin bloquear V3 ni las mejoras de texto. Su configuración y alcance permanecen abiertos; no implica reproducir Figma o Photoshop.

### 8.1 Probar una guía editorial de columnas y filas

Explorar columnas, filas, separación, márgenes y configuraciones o presets editoriales. Validar una grilla visible únicamente como guía del editor: no es una capa ni un efecto de trama y no forma parte de la imagen exportada. Estos detalles son propuestas para probar, no decisiones cerradas.

### 8.2 Evaluar alineación y ajuste a la grilla para texto y formas

Conectar la grilla con la edición directa de texto (2.2) y las capas de formas (2.7), usando el artboard de 2.8. Probar snapping activable a columnas, filas y márgenes; conservar posicionamiento libre al desactivarlo. Evaluar legibilidad de la guía y concordancia entre ajuste, controles, zoom y deshacer. La alineación básica puede desarrollarse sin esperar a esta grilla opcional.

### 8.3 Dejar las extensiones futuras identificadas

El posicionamiento de modelos 3D mediante la grilla sigue como posibilidad futura, no como requisito confirmado. Las capas de formas ya están aprobadas en 2.7 y no dependen de implementar la grilla; su ajuste a ella se evalúa en 8.2.

**Cierre opcional:** decidir si merece desarrollarse o posponerse. Si se desarrolla, validar la utilidad para texto, el ajuste activable y la separación entre guía e imagen exportada. Ningún resultado de esta fase condiciona el cierre obligatorio de V3.


## Seguimiento posterior — Página de guías

**Idea acordada con el usuario; desarrollar el alcance más adelante.** Crear una página de guías para ayudar a diseñadores a aprender Shader Lab y conseguir resultados útiles combinando sus capas. Registrar esta dirección sin iniciar su implementación ni añadirla como requisito de cierre de V3.

Como punto de partida, reutilizar los [estudios editables y recetas](public/examples/v3/README.md): mostrar el resultado visual, explicar el orden de las capas y el alcance de los grupos, destacar los controles que cambian el resultado y ofrecer archivos `.lab` para explorar. Considerar también guías breves de composición, pintura, color y exportación, con consejos de rendimiento cuando correspondan.

La organización de contenidos, el diseño de la página, su acceso desde la app y la selección de las primeras guías quedan por definir con el usuario. Priorizar explicaciones prácticas orientadas a resultados y mantener los ejemplos alineados con las herramientas disponibles.
