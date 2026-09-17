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

**Prioridades revisadas con el usuario (17 de septiembre de 2026):** texto transparente por defecto (2.1) implementado en #156 y confirmado por el usuario. Anillos desplazados implementados y validados visualmente; el usuario también confirmó la corrección de arrastre entre grupos. Regiones conectadas y contornos de perímetro en Photographic Cells (3.3.1 A+B) confirmados visualmente por el usuario; pintura manual confirmada visualmente por el usuario, con entrada automática a edición al elegir Paint. El usuario reporta alta carga/calor al combinar efectos: evaluar rendimiento durante reproducción y edición de escenas dinámicas en cada entrega. Posponer las máscaras básicas de círculo/rectángulo y su interfaz genérica: no bloquean texto ni la exploración de anillos; revisar cuándo retomarlas al cerrar el alcance de V3. Desarrollar modos de máscara adaptados al lenguaje visual de los efectos seleccionados. Registrar con prioridad baja una revisión de calidad de Blob Tracking y sus posibilidades como máscara (6.3).

## Fase 1 — Resolver la base de composición y proteger proyectos existentes

**Prioridad máxima:** transparencia y grupos sostienen la composición. La cobertura alfa necesaria para los modos creativos de máscara se incorpora con los efectos que la usan; la interfaz de máscaras básicas queda aplazada. La preparación inicial debe ser breve y servir a la ejecución.

### Referencias visuales obligatorias

Antes de decidir el comportamiento o la apariencia de cualquier shader, abrir las imágenes pertinentes de [V3-VISUAL-REFERENCES.md](V3-VISUAL-REFERENCES.md). El directorio original y la copia local contienen las dieciséis referencias del usuario. Comparar renders con esas imágenes; las pruebas técnicas no sustituyen la revisión visual ni dan por terminada una familia.

### 1.1 Preparar pruebas y referencias mínimas

Reunir las dieciséis imágenes elegidas y pruebas con fotografías, retratos, objetos, tipografía y video, variando luz y detalle. Guardar escenas existentes y resultados de referencia para comprobar su apariencia desde el primer cambio.

### 1.2 Comprobar el estado actual y corregir el canal alfa

Revisar la transparencia durante composición y efectos. Una inspección previa limitada en otro checkout detectó opacidad forzada, rellenos negros y procesamiento compartido; orienta esta comprobación, sin reproducir todos los problemas.

Permitir regiones vacías junto a contenido totalmente opaco. Bajar la opacidad global no sustituye la transparencia por píxel. Los efectos deben conservarla o transformarla con sentido y ofrecer fondos transparentes cuando generen fondos y corresponda. Esto no incluye eliminar automáticamente el fondo de fotografías arbitrarias.

### 1.3 Introducir grupos reales con alcance propio

Los grupos con alcance propio son **requisitos confirmados**, pedidos explícitamente por un colega diseñador. Las máscaras de grupo también se solicitaron, pero el usuario decidió posponer la interfaz de máscaras básicas y priorizar modos creativos ligados a efectos (1.4). Se propone composición aislada por defecto: procesar los contenidos pertinentes del grupo y luego integrarlo al conjunto. Sus efectos no deben afectar capas externas. Agregar carpetas sobre una cadena global de filtros no resuelve el requisito.

Incluir organización, reordenamiento, plegado, visibilidad, opacidad, deshacer y guardado. Definir la profundidad de anidamiento durante la implementación, sin prometer reproducir todo Photoshop.

**Ampliación acordada para más adelante — Pass Through:** añadir un modo opcional de grupo que permita a sus efectos procesar las capas inferiores externas, dentro del contexto de composición de su padre. Mantener **Isolated** como valor predeterminado, también para proyectos guardados que no indiquen un modo. Esta ampliación no bloquea las entregas en curso.

Ofrecer una elección explícita entre Isolated y Pass Through, con una explicación breve de su alcance. Un grupo con Ink y Displaced Rings sobre una imagen externa debe dejarla intacta en Isolated y procesarla al elegir Pass Through. Las capas superiores y las que estén fuera de un ancestro aislado deben conservar su independencia. Definir el comportamiento de opacidad, mezcla y recorte del grupo antes de implementarlo; no asumir que basta con aplanar sus hijos.

Validar grupos anidados y cambios de modo, visibilidad, reordenamiento, deshacer/rehacer, guardado/reapertura y paridad entre editor, runtime y exportación. Conservar la apariencia de todos los grupos aislados existentes.

### 1.4 Orientar las máscaras hacia modos creativos por efecto

**Decisión de producto:** posponer las máscaras básicas de círculo/rectángulo adjuntas a capas o grupos. Priorizar modos adaptados a cada efecto: por ejemplo, anillos o semidiscos desplazados que revelan fotografía y dejan huecos, o regiones detectadas por Blob Tracking que sirven de máscara. Los anillos se exploran en 3.2–3.3; Blob Tracking tiene prioridad baja en 6.3. No asumir que todas las capas necesitan el mismo interruptor genérico de máscara.

Al incorporar cada modo, definir qué contenido recorta, cómo se asigna y cómo se invierte/desactiva. La cobertura debe revelar capas inferiores, sin rellenos negros ni halos oscuros en bordes suaves. Mantener la composición aislada del grupo y la apariencia de los modos de máscara guardados. La transformación de la imagen y el recorte de su cobertura son comportamientos distintos que deben quedar claros en los controles.

Conservar esta pila como referencia de alcance para cuando se retomen las máscaras de grupo; no es un requisito del siguiente PR:

```text
Texto — fuera del grupo
Grupo «Retrato» — máscara circular
  Halftone
  Fotografía
Fondo — fuera del grupo
```

Halftone modifica solo la fotografía; la máscara circular recorta el grupo; texto y fondo quedan fuera de su alcance. La asignación arbitraria de la silueta de otra capa sigue como extensión sugerida, con alcance pendiente; no debe confundirse con un modo de máscara propio de un efecto.

### 1.5 Anticipar las decisiones de viabilidad 3D

Probar brevemente formatos, materiales, animaciones, conservación de recursos y geometría SVG. Registrar decisiones abiertas para las fases 4 y 5 sin demorar la composición. Una entrada de catálogo o tipo de capa no demuestra soporte completo de modelos.

**Cierre de la base:** huecos transparentes y contenido opaco conviven; grupos y efectos mantienen su alcance al reordenar, deshacer, guardar, reabrir y exportar. Las escenas anteriores conservan su apariencia y los bordes suaves quedan limpios. Cada modo creativo de máscara incorporado debe superar esas mismas pruebas en su fase; la interfaz básica aplazada no bloquea el cierre de esta base.

## Fase 2 — Facilitar las piezas tipográficas y pulir las capas actuales

**Prioridad temprana:** resolver la inserción y edición de texto aporta valor directo al diseño, junto con mejores efectos iniciales. Priorizar cambios útiles y acotados. Las pruebas pueden avanzar durante la fase 1; la integración depende de su tratamiento de transparencia, sin duplicarlo.

### 2.1 Insertar texto sobre fondo transparente

El usuario reporta texto blanco sobre negro y la necesidad de recurrir a máscaras, Screen o cambiar manualmente el fondo. El requisito es insertar texto visible, con contenido opaco y color editable sobre fondo transparente, sin esos rodeos. Mantener el fondo sólido como una opción deliberada y conservar el uso de texto como máscara cuando se elija expresamente.

La inspección inicial confirmó que `layers.ts` creaba texto en modo máscara y `layer-registry.ts` definía fondo negro con alfa 1. `text-pass.ts` ya distingue el alfa del fondo y dibuja el texto opaco; admite color editable y posición mediante anclaje y desplazamiento. La corrección debe cambiar los valores de capas nuevas y conservar el fondo sólido de archivos anteriores que omitan ese parámetro.

### 2.2 Explorar selección y arrastre directo en el lienzo

Probar el alcance mínimo útil para seleccionar un texto y moverlo arrastrando, sin depender de una grilla. Sincronizar el resultado con los controles existentes de posición, respetando anclaje y zoom. Verificar deshacer el movimiento y recuperar la misma posición al guardar y reabrir. Incorporarlo al alcance inicial si resulta viable como mejora acotada; no prometer un editor completo.

### 2.3 Revisar pequeñas mejoras de controles tipográficos

Conservar fuente, tamaño, peso, espaciado, color, anclaje y desplazamiento. Como **candidatas a validar**, revisar el límite actual de 32 caracteres, el tamaño mínimo de 48 y la claridad del control de fondo transparente o sólido. Evaluar si ampliar esos límites resuelve usos reales sin degradar la edición. Son oportunidades observadas, no nuevos requisitos ni un compromiso de construir un motor de composición tipográfica completo.

### 2.4 Ajustar halftone como primer efecto

Ajustar parámetros sobre el material de prueba hasta lograr resultados útiles con luces y detalles diversos. Introducir pequeñas mejoras algorítmicas solo si las pruebas lo justifican; no plantear una reescritura general.

### 2.5 Extender el criterio y facilitar la edición

Extender el criterio a los demás efectos. Organizar controles con etiquetas comprensibles, entradas numéricas, deslizadores apropiados y restablecimiento. Aplicarlo también a capas nuevas: valores curados como puntos de partida editables hasta la abstracción extrema.

#### 2.5.1 Colores editables en Threshold

**Implementado, pendiente de validación visual del usuario:** dos colores editables en la capa **Threshold** existente: **Color oscuro** y **Color claro**, reemplazando la salida fija negro/blanco por una combinación personalizada. Mantener negro y blanco como valores iniciales y como fallback en proyectos anteriores.

Conservar el funcionamiento del umbral, la inversión y la transparencia; cambiar la paleta solo modifica los colores de salida. Integrar los selectores con deshacer/rehacer, guardado/reapertura y exportación editor/runtime. Evitar un pase de render adicional para esta recoloración, teniendo en cuenta fuentes de video y escenas dinámicas.

**Cierre:** con los colores iniciales, las escenas existentes se ven iguales; al elegir, por ejemplo, azul y rosa, ambas regiones adoptan esos colores sin desplazar sus límites. La paleta elegida sobrevive al historial, reapertura y exportación.

Entrega: controles Dark Color / Light Color, fallbacks negro/blanco y mezcla dentro del pase existente, sin render adicional. Referencia 01 revisada y render azul/rosa inspeccionado. Pruebas de GPU editor/runtime, video decodificado, hidratación real, historial, guardado/reapertura y PNG; [prueba enfocada y límites](tests/composition/THRESHOLD-COLORS-MANUAL-QA.md).

### 2.6 Preservar las composiciones guardadas

Aplicar los nuevos valores únicamente a capas recién creadas y comparar proyectos anteriores con sus resultados de referencia, incluidos textos con fondo sólido, máscaras y modos de mezcla elegidos previamente.

**Cierre:** el texto nuevo se integra sobre fondo transparente sin activar máscaras ni Screen; su contenido permanece opaco y su color es editable. Si se incorpora el arrastre, coincide con controles, deshacer y posición guardada. Los efectos actuales ofrecen valores iniciales útiles, conservan libertad de edición y combinación, y las escenas anteriores —incluidos sus textos— mantienen su apariencia. Resolver estos puntos no depende de la grilla opcional.

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

La curaduría demuestra esas cualidades, no cierra toda la dirección artística ni reproduce los afiches. Sigue pendiente la aceptación del usuario, el acabado analógico más rico y la validación nativa de rendimiento/exportación temporal de 7.2. El mínimo tipográfico actual de 48px limita anotaciones finas; retomar el ajuste acotado de 2.3. La curaduría también confirma que el canvas sigue el viewport: las escenas importadas se reencuadran según la ventana. Registrar un artboard de tamaño estable como decisión de composición antes de presentar estas escenas como plantillas de afiches fijos. [Prueba manual, compatibilidad y límites](tests/composition/CELL-SCATTER-MANUAL-QA.md).

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

### 6.3 Revisar Blob Tracking y sus modos de máscara — prioridad baja

Pedido del usuario: dedicar una revisión de calidad a Blob Tracking porque tiene potencial visual desaprovechado. Comparar sus resultados actuales sobre fotografía y video; revisar detección, estabilidad temporal, contornos, valores iniciales y claridad de controles antes de elegir cambios. No asumir que necesita una reescritura completa.

Explorar modos de máscara adaptados a sus regiones detectadas y al movimiento, distinguiendo visualización de la máscara, aplicación de un efecto dentro de las regiones y recorte real de la fotografía. Validar inversión/desactivación, bordes, cobertura alfa, grupos, guardado, reapertura y exportación. Conservar los resultados de escenas anteriores. El alcance concreto se decide tras esa revisión; esta tarea no bloquea texto ni la exploración inicial de anillos.

**Cierre:** las familias seleccionadas pasan sus pruebas visuales, de libertad y composición; las candidatas pospuestas quedan identificadas sin presentarlas como entregas prometidas. Registrar el resultado de la revisión de Blob Tracking y qué mejoras o modos se integran o se aplazan.

## Fase 7 — Verificar el conjunto y cerrar V3

**Posición por dependencia:** requiere las entregas anteriores; no permite omitir su validación ni postergarla hasta aquí.

### 7.1 Revisar regresiones y usabilidad de extremo a extremo

Recorrer inserción, edición extrema, combinaciones, catálogo, grupos, máscaras, deshacer y reapertura. Incluir piezas tipográficas y, si se entrega, la concordancia del arrastre con los controles. Comparar escenas antiguas y comprobar que valores iniciales atractivos y libertad creativa coexisten.

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

### 8.2 Evaluar alineación y ajuste a la grilla para texto

Comenzar la exploración con texto y su arrastre, si este se incorpora. Probar snapping activable para alinear elementos, manteniendo posicionamiento libre al desactivarlo. Evaluar legibilidad de la guía y concordancia entre ajuste, controles y deshacer, sin ampliar el editor innecesariamente.

### 8.3 Dejar las extensiones futuras identificadas

El posicionamiento de modelos 3D mediante la grilla y las formas básicas —estrellas, cuadrados y círculos— son posibilidades futuras, **no requisitos confirmados**. Evaluarlas por separado solo si la guía inicial demuestra utilidad.

**Cierre opcional:** decidir si merece desarrollarse o posponerse. Si se desarrolla, validar la utilidad para texto, el ajuste activable y la separación entre guía e imagen exportada. Ningún resultado de esta fase condiciona el cierre obligatorio de V3.
