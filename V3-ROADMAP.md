# Shader Lab V3 — Hoja de trabajo priorizada

V3 debe facilitar resultados artísticamente atractivos desde la primera inserción y conservar libertad para transformarlos hasta volverlos irreconocibles. Los nuevos efectos serán protagonistas; los actuales seguirán disponibles y combinables. Crear piezas tipográficas con facilidad también es una prioridad práctica. Cada incorporación debe respetar las composiciones guardadas.

El orden es una **propuesta de ejecución**; las prioridades de producto son revisables. La composición fiable es una dependencia para integrar texto, efectos y 3D. Las fases 1–7 definen el recorrido de V3, con validación propia y cierre global obligatorio. La fase 8 es opcional y no condiciona ese cierre. No se afirman implementaciones, fechas ni rendimiento ilimitado.

## Flujo de integración y entrega

Todo el trabajo de V3 se entrega mediante PRs pequeños apilados. Cada nuevo PR parte de la rama del PR anterior y la usa como base. El primer PR de la pila apunta a la rama de integración de V3; un PR principal reúne esa rama y tiene como destino `main`.

**PR nuevo → PR anterior → rama de integración de V3 → PR principal → `main`.**

Los PRs pequeños pueden integrarse progresivamente en la rama de V3. Ningún cambio de V3 se integra en `main` hasta completar el alcance obligatorio del plan y su validación global de la fase 7. La fase 8 sigue siendo opcional y no bloquea esa entrega.

La rama de integración es `git-chad/shader-lab-v3-plan`. La pila comienza con [#151](https://github.com/basementstudio/shader-lab/pull/151), en `git-chad/v3-composition-alpha`, seguido de [#152](https://github.com/basementstudio/shader-lab/pull/152), en `git-chad/v3-transparent-media-bounds`. La base compartida de composición alfa continúa desde esta última rama. Al integrar PRs, actualizar las bases de los descendientes para conservar la pila; únicamente el PR principal apunta a `main` y permanece en borrador hasta completar la validación obligatoria.

PR principal: [#150 — V3: designer-focused composition and experimental graphics](https://github.com/basementstudio/shader-lab/pull/150).

Primer paso de la fase 1: [baselines de composición y mapa del canal alfa](tests/composition/README.md). Esta cobertura inicial no cierra la fase ni sustituye la validación visual con las catorce referencias elegidas.

Avance de 1.3: grupos aislados con hasta ocho niveles, controles del editor, reordenamiento de subárboles, plegado, visibilidad, opacidad, duplicación, deshacer, persistencia v7 y exportación de configuración. Las pruebas cubren estado, hidratación real y píxeles guardados/reabiertos. El usuario confirmó la prueba de aislamiento de foto + halftone, opacidad y plegado; la [lista manual ampliada](tests/composition/GROUPS-MANUAL-QA.md) sigue disponible para la validación global.

**Prioridades revisadas con el usuario (17 de septiembre de 2026):** texto transparente por defecto (2.1) implementado en #156 y confirmado por el usuario. Siguiente entrega: prototipo de los anillos desplazados ya previstos en 3.2–3.3; no es una familia adicional. Posponer las máscaras básicas de círculo/rectángulo y su interfaz genérica: no bloquean texto ni la exploración de anillos; revisar cuándo retomarlas al cerrar el alcance de V3. Desarrollar modos de máscara adaptados al lenguaje visual de los efectos seleccionados. Registrar con prioridad baja una revisión de calidad de Blob Tracking y sus posibilidades como máscara (6.3).

## Fase 1 — Resolver la base de composición y proteger proyectos existentes

**Prioridad máxima:** transparencia y grupos sostienen la composición. La cobertura alfa necesaria para los modos creativos de máscara se incorpora con los efectos que la usan; la interfaz de máscaras básicas queda aplazada. La preparación inicial debe ser breve y servir a la ejecución.

### 1.1 Preparar pruebas y referencias mínimas

Reunir las catorce imágenes elegidas y pruebas con fotografías, retratos, objetos, tipografía y video, variando luz y detalle. Guardar escenas existentes y resultados de referencia para comprobar su apariencia desde el primer cambio.

### 1.2 Comprobar el estado actual y corregir el canal alfa

Revisar la transparencia durante composición y efectos. Una inspección previa limitada en otro checkout detectó opacidad forzada, rellenos negros y procesamiento compartido; orienta esta comprobación, sin reproducir todos los problemas.

Permitir regiones vacías junto a contenido totalmente opaco. Bajar la opacidad global no sustituye la transparencia por píxel. Los efectos deben conservarla o transformarla con sentido y ofrecer fondos transparentes cuando generen fondos y corresponda. Esto no incluye eliminar automáticamente el fondo de fotografías arbitrarias.

### 1.3 Introducir grupos reales con alcance propio

Los grupos con alcance propio son **requisitos confirmados**, pedidos explícitamente por un colega diseñador. Las máscaras de grupo también se solicitaron, pero el usuario decidió posponer la interfaz de máscaras básicas y priorizar modos creativos ligados a efectos (1.4). Se propone composición aislada por defecto: procesar los contenidos pertinentes del grupo y luego integrarlo al conjunto. Sus efectos no deben afectar capas externas. Agregar carpetas sobre una cadena global de filtros no resuelve el requisito.

Incluir organización, reordenamiento, plegado, visibilidad, opacidad, deshacer y guardado. Definir la profundidad de anidamiento durante la implementación, sin prometer reproducir todo Photoshop.

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

### 2.6 Preservar las composiciones guardadas

Aplicar los nuevos valores únicamente a capas recién creadas y comparar proyectos anteriores con sus resultados de referencia, incluidos textos con fondo sólido, máscaras y modos de mezcla elegidos previamente.

**Cierre:** el texto nuevo se integra sobre fondo transparente sin activar máscaras ni Screen; su contenido permanece opaco y su color es editable. Si se incorpora el arrastre, coincide con controles, deshacer y posición guardada. Los efectos actuales ofrecen valores iniciales útiles, conservan libertad de edición y combinación, y las escenas anteriores —incluidos sus textos— mantienen su apariencia. Resolver estos puntos no depende de la grilla opcional.

## Fase 3 — Explorar la primera tanda artística e incorporarla al catálogo

**Prioridad propuesta:** anillos, celdas y revelado alterado ofrecen transformaciones diferentes. Esta tanda es una recomendación del asistente, no una selección definitiva del usuario.

### 3.1 Traducir las referencias en criterios visuales

Explorar deterioro fotográfico, imágenes sintéticas o escultóricas y geometría, inspirados en afiches experimentales, discos, revistas de música electrónica, Photoshop y diseño de finales de los noventa y los dos mil. Admitir registros claros, oscuros, sobrios y coloridos.

La base principal son las catorce imágenes elegidas, más Lovedance —forma roja sobre fotografía azul, atravesada por luces— y el collage monocromo de foto difusa, curvas técnicas y tipografía precisas. Transformar fotografía con geometría, tono, textura y composición sin limitarse al cyberpunk o una estética retro. Los archivos iniciales fueron exploratorios: solo dos ejemplos interesaron y una página de Paradiso falló.

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

**Primer prototipo implementado, pendiente de validación visual del usuario:** Displaced Rings admite 1–128 bandas (48 comprobadas), anillos/semidiscos, centro, radio, distribución, desplazamiento alternado/progresivo/aleatorio con semilla, rotación global y por banda, escala progresiva, separación y bordes suaves. Output distingue Distort y Cutout; dentro de un grupo, Cutout revela las capas externas por los huecos. Editor y runtime comparten el comportamiento, con pruebas de píxeles, hidratación real, deshacer, guardado/reapertura y PNG. El catálogo incorpora una vista previa fotográfica y muestra el efecto primero. Ver [alcance y prueba manual](tests/composition/DISPLACED-RINGS-MANUAL-QA.md).

Esto no cierra la fase 3: quedan la curaduría visual con las referencias completas, combinaciones con otros efectos, rendimiento con fotografías/video a resoluciones representativas y la selección de las otras familias. El prototipo usa transformaciones progresivas; no incluye controles individuales por anillo ni inversión de cobertura.

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
